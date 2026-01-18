/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import Actor from '../actor.js';
import Client from '../client.js';
import {
  DEFAULT_MAX_STEPS,
  DEFAULT_MAX_STEPS_TASKER,
  DEFAULT_REFLECTION_INTERVAL,
  DEFAULT_STEP_DELAY,
  DEFAULT_TEMPERATURE,
  MODEL_ACTOR,
} from '../consts.js';
import getLogger from '../logger.js';
import type {
  ActionEvent,
  ActionHandler,
  ImageProvider,
  PlanEvent,
  SplitEvent,
  StepEvent,
  StepObserver,
} from '../types/index.js';
import type { Action, Step } from '../types/models/index.js';
import type {
  HistoryItem,
  Todo as ClientTodo,
} from '../types/models/client.js';
import type { Agent } from './index.js';

const logger = getLogger('agent.tasker');

type ResettableHandler = ActionHandler & { reset?: () => void };
type ImageLike = ArrayBuffer | string;

const resetHandler = (handler: ResettableHandler) => {
  if (typeof handler.reset === 'function') {
    handler.reset();
  }
};

const sleep = (seconds: number) =>
  new Promise<void>(resolve => setTimeout(resolve, seconds * 1000));

const extractUuidFromUrl = (url: string): string | null => {
  const pattern =
    /\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\.[a-z]+)?(?:\?|$)/i;
  const match = pattern.exec(url);
  return match ? match[1] : null;
};

type TodoStatus = ClientTodo['status'] | 'skipped';

interface TodoItem {
  description: string;
  status: TodoStatus;
}

interface TaskerAction {
  timestamp: string;
  action_type: string;
  target?: string | null;
  details?: Record<string, unknown>;
  reasoning?: string | null;
  result?: string | null;
  screenshot_uuid?: string | null;
}

interface TodoHistory {
  todo_index: number;
  todo: string;
  actions: TaskerAction[];
  summary?: string;
  completed: boolean;
}

interface PlannerOutput {
  instruction: string;
  reasoning: string;
  subtodos: string[];
}

interface ReflectionOutput {
  continue_current: boolean;
  new_instruction?: string | null;
  reasoning: string;
  success_assessment: boolean;
}

interface ExecutionResult {
  success: boolean;
  actions: TaskerAction[];
  summary: string;
  error?: string;
  total_steps: number;
}

type PlannerContext = Record<string, unknown>;

class PlannerMemory {
  taskDescription = '';
  todos: TodoItem[] = [];
  history: TodoHistory[] = [];
  taskExecutionSummary = '';
  todoExecutionSummaries: Record<number, string> = {};

  setTask(taskDescription: string, todos: string[] | TodoItem[]) {
    this.taskDescription = taskDescription;
    this.todos = todos.map(todo =>
      typeof todo === 'string'
        ? { description: todo, status: 'pending' }
        : todo,
    );
  }

  getCurrentTodo(): { todo: TodoItem; index: number } | null {
    for (let i = 0; i < this.todos.length; i++) {
      const todo = this.todos[i];
      if (todo.status === 'pending' || todo.status === 'in_progress') {
        return { todo, index: i };
      }
    }
    return null;
  }

  updateTodo(index: number, status: TodoStatus, summary?: string) {
    if (index < 0 || index >= this.todos.length) return;
    this.todos[index].status = status;
    if (summary) {
      this.todoExecutionSummaries[index] = summary;
    }
  }

  addHistory(
    todoIndex: number,
    actions: TaskerAction[],
    summary?: string,
    completed: boolean = false,
  ) {
    if (todoIndex < 0 || todoIndex >= this.todos.length) return;
    this.history.push({
      todo_index: todoIndex,
      todo: this.todos[todoIndex].description,
      actions,
      summary,
      completed,
    });
  }

  getContext(): PlannerContext {
    return {
      task_description: this.taskDescription,
      todos: this.todos.map((todo, index) => ({
        index,
        description: todo.description,
        status: todo.status,
      })),
      history: this.history.map(history => ({
        todo_index: history.todo_index,
        todo: history.todo,
        action_count: history.actions.length,
        summary: history.summary,
        completed: history.completed,
      })),
      task_execution_summary: this.taskExecutionSummary,
      todo_execution_summaries: this.todoExecutionSummaries,
    };
  }

  getTodoStatusSummary(): Record<string, number> {
    const summary: Record<string, number> = {
      pending: 0,
      in_progress: 0,
      completed: 0,
      skipped: 0,
      blocked: 0,
    };
    for (const todo of this.todos) {
      summary[todo.status] = (summary[todo.status] ?? 0) + 1;
    }
    return summary;
  }

  appendTodo(description: string) {
    this.todos.push({ description, status: 'pending' });
  }
}

class Planner {
  private client?: Client;
  private ownsClient = false;

  constructor(
    client?: Client,
    private apiKey?: string,
    private baseUrl?: string,
  ) {
    this.client = client;
  }

  private ensureClient(): Client {
    if (!this.client) {
      this.client = new Client(this.baseUrl, this.apiKey);
      this.ownsClient = true;
    }
    return this.client;
  }

  getClient(): Client {
    return this.ensureClient();
  }

  async close() {
    if (!this.ownsClient || !this.client) return;
    const closable = this.client as Client & { close?: () => Promise<void> };
    if (typeof closable.close === 'function') {
      await closable.close();
    }
  }

  private extractMemoryData(
    memory: PlannerMemory | undefined,
    context: PlannerContext,
    todoIndex?: number,
  ) {
    if (memory && todoIndex !== undefined) {
      const taskDescription = memory.taskDescription;
      const todos: ClientTodo[] = memory.todos.map((todo, index) => ({
        index,
        description: todo.description,
        status: todo.status as ClientTodo['status'],
        execution_summary: memory.todoExecutionSummaries[index] ?? undefined,
      }));
      const history: HistoryItem[] = memory.history.map(history => ({
        todo_index: history.todo_index,
        todo_description: history.todo,
        action_count: history.actions.length,
        summary: history.summary ?? undefined,
        completed: history.completed,
      }));
      const taskExecutionSummary = memory.taskExecutionSummary || undefined;
      const overallTodo = memory.todos[todoIndex]
        ? memory.todos[todoIndex].description
        : '';
      return {
        taskDescription,
        todos,
        history,
        taskExecutionSummary,
        overallTodo,
      };
    }

    const rawTodos = context.todos;
    const rawHistory = context.history;

    return {
      taskDescription: (context.task_description as string) ?? '',
      todos: Array.isArray(rawTodos) ? (rawTodos as ClientTodo[]) : [],
      history: Array.isArray(rawHistory) ? (rawHistory as HistoryItem[]) : [],
      taskExecutionSummary: undefined,
      overallTodo: (context.current_todo as string) ?? '',
    };
  }

  private extractJsonString(text: string): string {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}') + 1;
    if (start < 0 || end <= start) return '';
    return text.slice(start, end);
  }

  private parsePlannerOutput(response: string): PlannerOutput {
    try {
      const jsonResponse = this.extractJsonString(response);
      const data = JSON.parse(jsonResponse);
      return {
        instruction: data.subtask ?? data.instruction ?? '',
        reasoning: data.reasoning ?? '',
        subtodos: data.subtodos ?? [],
      };
    } catch {
      return {
        instruction: '',
        reasoning: 'Failed to parse structured response',
        subtodos: [],
      };
    }
  }

  private parseReflectionOutput(response: string): ReflectionOutput {
    try {
      const jsonResponse = this.extractJsonString(response);
      const data = JSON.parse(jsonResponse);
      const success = data.success === 'yes';
      const newSubtask = (data.subtask_instruction ?? '').trim();
      const continueCurrent = !success && !newSubtask;
      return {
        continue_current: continueCurrent,
        new_instruction: newSubtask || null,
        reasoning: data.reflection ?? data.reasoning ?? '',
        success_assessment: success,
      };
    } catch {
      return {
        continue_current: true,
        new_instruction: null,
        reasoning:
          'Failed to parse reflection response, continuing current approach',
        success_assessment: false,
      };
    }
  }

  private formatExecutionNotes(context: PlannerContext): string {
    const history = context.history as HistoryItem[] | undefined;
    if (!history?.length) return '';
    const parts: string[] = [];
    for (const item of history) {
      parts.push(
        `Todo ${item.todo_index}: ${item.action_count} actions, completed: ${item.completed}`,
      );
      if (item.summary) {
        parts.push(`Summary: ${item.summary}`);
      }
    }
    return parts.join('\n');
  }

  private async ensureScreenshotUuid(screenshot?: ImageLike) {
    if (!screenshot) return { uuid: undefined, url: undefined };
    if (typeof screenshot === 'string') {
      const uuid = extractUuidFromUrl(screenshot);
      return { uuid: uuid ?? undefined, url: screenshot };
    }

    const client = this.ensureClient();
    const upload = await client.putS3PresignedUrl(screenshot);
    return { uuid: upload.uuid, url: upload.download_url };
  }

  async initialPlan(
    todo: string,
    context: PlannerContext,
    screenshot?: ImageLike,
    memory?: PlannerMemory,
    todoIndex?: number,
  ): Promise<{ output: PlannerOutput; requestId?: string | null }> {
    const client = this.ensureClient();
    const { uuid } = await this.ensureScreenshotUuid(screenshot);
    const { taskDescription, todos, history, taskExecutionSummary } =
      this.extractMemoryData(memory, context, todoIndex);

    const response = await client.callWorker({
      workerId: 'oagi_first',
      overallTodo: todo,
      taskDescription,
      todos,
      history,
      currentTodoIndex: todoIndex,
      taskExecutionSummary,
      currentScreenshot: uuid,
    });

    return {
      output: this.parsePlannerOutput(response.response),
      requestId: response.request_id,
    };
  }

  async reflect(
    actions: TaskerAction[],
    context: PlannerContext,
    screenshot?: ImageLike,
    memory?: PlannerMemory,
    todoIndex?: number,
    currentInstruction?: string,
    reflectionInterval: number = DEFAULT_REFLECTION_INTERVAL,
  ): Promise<{ output: ReflectionOutput; requestId?: string | null }> {
    const client = this.ensureClient();
    const { uuid } = await this.ensureScreenshotUuid(screenshot);
    const {
      taskDescription,
      todos,
      history,
      taskExecutionSummary,
      overallTodo,
    } = this.extractMemoryData(memory, context, todoIndex);

    const windowActions = actions.slice(-reflectionInterval);
    const windowSteps = windowActions.map((action, index) => ({
      step_number: index + 1,
      action_type: action.action_type,
      target: action.target ?? '',
      reasoning: action.reasoning ?? '',
    }));
    const windowScreenshots = windowActions
      .map(action => action.screenshot_uuid)
      .filter(Boolean);
    const priorNotes = this.formatExecutionNotes(context);

    const response = await client.callWorker({
      workerId: 'oagi_follow',
      overallTodo,
      taskDescription,
      todos,
      history,
      currentTodoIndex: todoIndex,
      taskExecutionSummary,
      currentSubtaskInstruction: currentInstruction ?? '',
      windowSteps: windowSteps as unknown as Step[],
      windowScreenshots: windowScreenshots as string[],
      resultScreenshot: uuid,
      priorNotes,
    });

    return {
      output: this.parseReflectionOutput(response.response),
      requestId: response.request_id,
    };
  }

  async summarize(
    _executionHistory: TaskerAction[],
    context: PlannerContext,
    memory?: PlannerMemory,
    todoIndex?: number,
  ): Promise<{ summary: string; requestId?: string | null }> {
    const client = this.ensureClient();
    const {
      taskDescription,
      todos,
      history,
      taskExecutionSummary,
      overallTodo,
    } = this.extractMemoryData(memory, context, todoIndex);

    const latestTodoSummary =
      memory && todoIndex !== undefined
        ? memory.todoExecutionSummaries[todoIndex]
        : '';

    const response = await client.callWorker({
      workerId: 'oagi_task_summary',
      overallTodo,
      taskDescription,
      todos,
      history,
      currentTodoIndex: todoIndex,
      taskExecutionSummary,
      latestTodoSummary,
    });

    try {
      const parsed = JSON.parse(response.response);
      return {
        summary: parsed.task_summary ?? response.response,
        requestId: response.request_id,
      };
    } catch {
      return { summary: response.response, requestId: response.request_id };
    }
  }
}

class TaskeeAgent implements Agent {
  private apiKey?: string;
  private baseUrl?: string;
  private model: string;
  private maxSteps: number;
  private reflectionInterval: number;
  private temperature?: number;
  private planner: Planner;
  private externalMemory?: PlannerMemory;
  private todoIndex?: number;
  private stepObserver?: StepObserver;
  private stepDelay: number;

  private actor?: Actor;
  private currentTodo = '';
  private currentInstruction = '';
  private actions: TaskerAction[] = [];
  private totalActions = 0;
  private sinceReflection = 0;
  private success = false;

  constructor(
    apiKey?: string,
    baseUrl?: string,
    model: string = MODEL_ACTOR,
    maxSteps: number = DEFAULT_MAX_STEPS,
    reflectionInterval: number = DEFAULT_REFLECTION_INTERVAL,
    temperature: number | undefined = DEFAULT_TEMPERATURE,
    planner?: Planner,
    externalMemory?: PlannerMemory,
    todoIndex?: number,
    stepObserver?: StepObserver,
    stepDelay: number = DEFAULT_STEP_DELAY,
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model;
    this.maxSteps = maxSteps;
    this.reflectionInterval = reflectionInterval;
    this.temperature = temperature;
    this.planner = planner ?? new Planner(undefined, apiKey, baseUrl);
    this.externalMemory = externalMemory;
    this.todoIndex = todoIndex;
    this.stepObserver = stepObserver;
    this.stepDelay = stepDelay;
  }

  async execute(
    instruction: string,
    actionHandler: ActionHandler,
    imageProvider: ImageProvider,
  ): Promise<boolean> {
    resetHandler(actionHandler as ResettableHandler);

    this.currentTodo = instruction;
    this.actions = [];
    this.totalActions = 0;
    this.sinceReflection = 0;
    this.success = false;

    try {
      this.actor = new Actor(
        this.apiKey,
        this.baseUrl,
        this.model,
        this.temperature,
      );

      await this.initialPlan(imageProvider);
      this.actor.initTask(this.currentInstruction, this.maxSteps);

      let remainingSteps = this.maxSteps;
      while (remainingSteps > 0 && !this.success) {
        const stepsTaken = await this.executeSubtask(
          Math.min(this.maxSteps, remainingSteps),
          actionHandler,
          imageProvider,
        );
        remainingSteps -= stepsTaken;

        if (!this.success && remainingSteps > 0) {
          const shouldContinue = await this.reflectAndDecide(imageProvider);
          if (!shouldContinue) {
            break;
          }
        }
      }

      await this.generateSummary();
      return this.success;
    } catch (err) {
      logger.error(`Error executing todo: ${err}`);
      this.recordAction('error', null, String(err));
      return false;
    } finally {
      this.actor = undefined;
    }
  }

  private getContext(): PlannerContext {
    return this.externalMemory ? this.externalMemory.getContext() : {};
  }

  private recordAction(
    actionType: string,
    target: string | null,
    reasoning?: string | null,
    result?: string | null,
    screenshotUuid?: string | null,
  ) {
    this.actions.push({
      timestamp: new Date().toISOString(),
      action_type: actionType,
      target,
      reasoning,
      result,
      details: {},
      screenshot_uuid: screenshotUuid ?? undefined,
    });
  }

  private async initialPlan(imageProvider: ImageProvider) {
    logger.info('Generating initial plan for todo');
    const screenshot = await imageProvider.provide();
    const context = this.getContext();
    const { output, requestId } = await this.planner.initialPlan(
      this.currentTodo,
      context,
      screenshot,
      this.externalMemory,
      this.todoIndex,
    );

    this.recordAction('plan', 'initial', output.reasoning, output.instruction);

    if (this.stepObserver) {
      const event: PlanEvent = {
        type: 'plan',
        timestamp: new Date(),
        phase: 'initial',
        image: screenshot,
        reasoning: output.reasoning,
        result: output.instruction,
        request_id: requestId ?? undefined,
      };
      await this.stepObserver.onEvent(event);
    }

    this.currentInstruction = output.instruction;
    logger.info(`Initial instruction: ${this.currentInstruction}`);
  }

  private async executeSubtask(
    maxSteps: number,
    actionHandler: ActionHandler,
    imageProvider: ImageProvider,
  ): Promise<number> {
    logger.info(`Executing subtask with max ${maxSteps} steps`);
    let stepsTaken = 0;
    const client = this.planner.getClient();

    for (let stepNum = 0; stepNum < maxSteps; stepNum++) {
      const screenshot = await imageProvider.provide();
      let screenshotUuid: string | undefined;
      let screenshotUrl: string | undefined;

      try {
        if (typeof screenshot === 'string') {
          screenshotUuid = extractUuidFromUrl(screenshot) ?? undefined;
          screenshotUrl = screenshot;
        } else {
          const upload = await client.putS3PresignedUrl(screenshot);
          screenshotUuid = upload.uuid;
          screenshotUrl = upload.download_url;
        }
      } catch (err) {
        logger.error(`Error uploading screenshot: ${err}`);
        this.recordAction('error', 'screenshot_upload', String(err));
        break;
      }

      let step: Step;
      try {
        step = await this.actor!.step(screenshotUrl ?? screenshot, undefined);
      } catch (err) {
        logger.error(`Error getting step from OAGI: ${err}`);
        this.recordAction(
          'error',
          'oagi_step',
          String(err),
          null,
          screenshotUuid,
        );
        break;
      }

      if (step.reason) {
        logger.info(`Step ${this.totalActions + 1}: ${step.reason}`);
      }

      if (this.stepObserver) {
        const event: StepEvent = {
          type: 'step',
          timestamp: new Date(),
          step_num: this.totalActions + 1,
          image: screenshot,
          step,
          task_id: (this.actor as any).taskId,
        };
        await this.stepObserver.onEvent(event);
      }

      if (step.actions?.length) {
        logger.info(`Actions (${step.actions.length}):`);
        for (const action of step.actions) {
          const countSuffix =
            action.count && action.count > 1 ? ` x${action.count}` : '';
          logger.info(`  [${action.type}] ${action.argument}${countSuffix}`);
        }

        for (const action of step.actions) {
          this.recordAction(
            action.type,
            action.argument,
            step.reason ?? null,
            null,
            screenshotUuid,
          );
        }

        let error: string | null = null;
        try {
          await actionHandler.handle(step.actions as Action[]);
        } catch (err) {
          error = String(err);
          throw err;
        } finally {
          if (this.stepObserver) {
            const event: ActionEvent = {
              type: 'action',
              timestamp: new Date(),
              step_num: this.totalActions + 1,
              actions: step.actions as Action[],
              error: error ?? undefined,
            };
            await this.stepObserver.onEvent(event);
          }
        }

        this.totalActions += step.actions.length;
        this.sinceReflection += step.actions.length;
      }

      if (this.stepDelay > 0) {
        await sleep(this.stepDelay);
      }

      stepsTaken += 1;

      if (step.stop) {
        logger.info('OAGI signaled task completion');
        break;
      }

      if (this.sinceReflection >= this.reflectionInterval) {
        logger.info('Reflection interval reached');
        break;
      }
    }

    return stepsTaken;
  }

  private async reflectAndDecide(
    imageProvider: ImageProvider,
  ): Promise<boolean> {
    logger.info('Reflecting on progress');
    const screenshot = await imageProvider.provide();
    const context = this.getContext();
    context.current_todo = this.currentTodo;

    const recentActions = this.actions.slice(-this.sinceReflection);
    const { output, requestId } = await this.planner.reflect(
      recentActions,
      context,
      screenshot,
      this.externalMemory,
      this.todoIndex,
      this.currentInstruction,
      this.reflectionInterval,
    );

    this.recordAction(
      'reflect',
      null,
      output.reasoning,
      output.continue_current ? 'continue' : 'pivot',
    );

    if (this.stepObserver) {
      const decision = output.success_assessment
        ? 'success'
        : output.continue_current
          ? 'continue'
          : 'pivot';
      const event: PlanEvent = {
        type: 'plan',
        timestamp: new Date(),
        phase: 'reflection',
        image: screenshot,
        reasoning: output.reasoning,
        result: decision,
        request_id: requestId ?? undefined,
      };
      await this.stepObserver.onEvent(event);
    }

    if (output.success_assessment) {
      this.success = true;
      logger.info('Reflection indicates task is successful');
      return false;
    }

    this.sinceReflection = 0;

    if (!output.continue_current && output.new_instruction) {
      logger.info(`Pivoting to new instruction: ${output.new_instruction}`);
      this.currentInstruction = output.new_instruction;
      await this.actor!.initTask(this.currentInstruction, this.maxSteps);
      return true;
    }

    return output.continue_current;
  }

  private async generateSummary() {
    logger.info('Generating execution summary');
    const context = this.getContext();
    context.current_todo = this.currentTodo;
    const { summary, requestId } = await this.planner.summarize(
      this.actions,
      context,
      this.externalMemory,
      this.todoIndex,
    );

    this.recordAction('summary', null, summary);

    if (this.stepObserver) {
      const event: PlanEvent = {
        type: 'plan',
        timestamp: new Date(),
        phase: 'summary',
        image: undefined,
        reasoning: summary,
        result: undefined,
        request_id: requestId ?? undefined,
      };
      await this.stepObserver.onEvent(event);
    }

    logger.info(`Execution summary: ${summary}`);
  }

  returnExecutionResults(): ExecutionResult {
    let summary = '';
    for (let i = this.actions.length - 1; i >= 0; i--) {
      if (this.actions[i].action_type === 'summary') {
        summary = this.actions[i].reasoning ?? '';
        break;
      }
    }
    return {
      success: this.success,
      actions: this.actions,
      summary,
      total_steps: this.totalActions,
    };
  }
}

export class TaskerAgent implements Agent {
  /** Hierarchical agent that manages multi-todo workflows. */

  private apiKey?: string;
  private baseUrl?: string;
  private model: string;
  private maxSteps: number;
  private temperature?: number;
  private reflectionInterval: number;
  private planner: Planner;
  private stepObserver?: StepObserver;
  private stepDelay: number;

  private memory = new PlannerMemory();
  private currentTaskeeAgent?: TaskeeAgent;

  constructor(
    apiKey?: string,
    baseUrl?: string,
    model: string = MODEL_ACTOR,
    maxSteps: number = DEFAULT_MAX_STEPS_TASKER,
    temperature: number | undefined = DEFAULT_TEMPERATURE,
    reflectionInterval: number = DEFAULT_REFLECTION_INTERVAL,
    planner?: Planner,
    stepObserver?: StepObserver,
    stepDelay: number = DEFAULT_STEP_DELAY,
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model;
    this.maxSteps = maxSteps;
    this.temperature = temperature;
    this.reflectionInterval = reflectionInterval;
    this.planner = planner ?? new Planner(undefined, apiKey, baseUrl);
    this.stepObserver = stepObserver;
    this.stepDelay = stepDelay;
  }

  setTask(task: string, todos: string[]) {
    this.memory.setTask(task, todos);
    logger.info(`Task set with ${todos.length} todos`);
  }

  set_task(task: string, todos: string[]) {
    this.setTask(task, todos);
  }

  async execute(
    _instruction: string,
    actionHandler: ActionHandler,
    imageProvider: ImageProvider,
  ): Promise<boolean> {
    resetHandler(actionHandler as ResettableHandler);

    let overallSuccess = true;
    while (true) {
      const todoInfo = this.prepare();
      if (!todoInfo) {
        logger.info('No more todos to execute');
        break;
      }

      const { todo, index } = todoInfo;
      logger.info(`Executing todo ${index}: ${todo.description}`);

      if (this.stepObserver) {
        const event: SplitEvent = {
          type: 'split',
          timestamp: new Date(),
          label: `Start of todo ${index + 1}: ${todo.description}`,
        };
        await this.stepObserver.onEvent(event);
      }

      const success = await this.executeTodo(
        index,
        actionHandler,
        imageProvider,
      );

      if (this.stepObserver) {
        const event: SplitEvent = {
          type: 'split',
          timestamp: new Date(),
          label: `End of todo ${index + 1}: ${todo.description}`,
        };
        await this.stepObserver.onEvent(event);
      }

      if (!success) {
        logger.warn(`Todo ${index} failed`);
        overallSuccess = false;
        const currentStatus = this.memory.todos[index]?.status;
        if (currentStatus === 'in_progress') {
          logger.error('Todo failed with exception, stopping execution');
          break;
        }
      }

      this.updateTaskSummary();
    }

    const statusSummary = this.memory.getTodoStatusSummary();
    logger.info(
      `Workflow complete. Status summary: ${JSON.stringify(statusSummary)}`,
    );
    return overallSuccess;
  }

  private prepare(): { todo: TodoItem; index: number } | null {
    const current = this.memory.getCurrentTodo();
    if (!current) return null;

    this.currentTaskeeAgent = new TaskeeAgent(
      this.apiKey,
      this.baseUrl,
      this.model,
      this.maxSteps,
      this.reflectionInterval,
      this.temperature,
      this.planner,
      this.memory,
      current.index,
      this.stepObserver,
      this.stepDelay,
    );

    if (current.todo.status === 'pending') {
      this.memory.updateTodo(current.index, 'in_progress');
    }

    logger.info(`Prepared taskee agent for todo ${current.index}`);
    return current;
  }

  private async executeTodo(
    todoIndex: number,
    actionHandler: ActionHandler,
    imageProvider: ImageProvider,
  ): Promise<boolean> {
    if (!this.currentTaskeeAgent || todoIndex < 0) {
      logger.error('No taskee agent prepared');
      return false;
    }

    const todo = this.memory.todos[todoIndex];
    try {
      const success = await this.currentTaskeeAgent.execute(
        todo.description,
        actionHandler,
        imageProvider,
      );
      const results = this.currentTaskeeAgent.returnExecutionResults();
      this.updateMemoryFromExecution(todoIndex, results, success);
      return success;
    } catch (err) {
      logger.error(`Error executing todo ${todoIndex}: ${err}`);
      this.memory.updateTodo(
        todoIndex,
        'in_progress',
        `Execution failed: ${String(err)}`,
      );
      return false;
    }
  }

  private updateMemoryFromExecution(
    todoIndex: number,
    results: ExecutionResult,
    success: boolean,
  ) {
    const status: TodoStatus = success ? 'completed' : 'in_progress';
    this.memory.updateTodo(todoIndex, status, results.summary);
    this.memory.addHistory(
      todoIndex,
      results.actions,
      results.summary,
      success,
    );

    if (success) {
      const summaryLine = `- Completed todo ${todoIndex}: ${results.summary}`;
      this.memory.taskExecutionSummary = this.memory.taskExecutionSummary
        ? `${this.memory.taskExecutionSummary}\n${summaryLine}`
        : summaryLine;
    }

    logger.info(
      `Updated memory for todo ${todoIndex}: status=${status}, actions=${results.actions.length}`,
    );
  }

  private updateTaskSummary() {
    const statusSummary = this.memory.getTodoStatusSummary();
    const completed = statusSummary.completed ?? 0;
    const total = this.memory.todos.length;

    const summaryParts = [`Progress: ${completed}/${total} todos completed`];
    const recentHistory = this.memory.history.slice(-3);
    for (const history of recentHistory) {
      if (history.completed && history.summary) {
        summaryParts.push(
          `- Todo ${history.todo_index}: ${history.summary.slice(0, 100)}`,
        );
      }
    }
    this.memory.taskExecutionSummary = summaryParts.join('\n');
  }

  getMemory(): PlannerMemory {
    return this.memory;
  }

  appendTodo(description: string) {
    this.memory.appendTodo(description);
    logger.info(`Appended new todo: ${description}`);
  }
}
