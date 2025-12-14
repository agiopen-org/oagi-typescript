/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import Client from '../../client.js';
import { DEFAULT_REFLECTION_INTERVAL } from '../../consts.js';
import type {
  URL,
  Image,
  GenerateResponse,
  GenerateOption,
} from '../../types/index.js';
import { extractUuidFromUrl } from '../../types/url.js';

import type { PlannerMemory } from './memory.js';
import type {
  TaskerAction,
  PlannerOutput,
  ReflectionOutput,
} from './models.js';

export class Planner {
  /**
   * Planner for task decomposition and reflection.
   *
   * This class provides planning and reflection capabilities using OAGI workers.
   */

  private client?: Client;
  private api_key?: string;
  private base_url?: string;
  private owns_client = false;

  constructor(client?: Client, api_key?: string, base_url?: string) {
    /**
     * Initialize the planner.
     */
    this.client = client;
    this.api_key = api_key;
    this.base_url = base_url;
  }

  private ensure_client(): Client {
    /** Ensure we have a client, creating one if needed. */
    if (!this.client) {
      this.client = new Client(this.base_url, this.api_key ?? null);
      this.owns_client = true;
    }
    return this.client;
  }

  async close() {
    /** Close the client if we own it. */
    if (this.owns_client && this.client) {
      // No-op in TS (fetch based)
    }
  }

  private extract_memory_data(
    memory: PlannerMemory | null | undefined,
    context: Record<string, any>,
    todo_index?: number | null,
  ): [
    task_description: string,
    todos: any[],
    history: any[],
    task_execution_summary: string | null,
    overall_todo: string,
  ] {
    /**
     * Extract memory data for API calls.
     */
    if (memory && todo_index !== undefined && todo_index !== null) {
      const task_description = memory.task_description;
      const todos = memory.todos.map((t, i) => ({
        index: i,
        description: t.description,
        status: t.status,
        execution_summary: memory.todo_execution_summaries[i],
      }));
      const history = memory.history.map(h => ({
        todo_index: h.todo_index,
        todo_description: h.todo,
        action_count: h.actions.length,
        summary: h.summary,
        completed: h.completed,
      }));
      const task_execution_summary = memory.task_execution_summary || null;
      const overall_todo = memory.todos.length
        ? (memory.todos[todo_index]?.description ?? '')
        : '';
      return [
        task_description,
        todos,
        history,
        task_execution_summary,
        overall_todo,
      ];
    }

    const task_description = context.task_description ?? '';
    const todos = context.todos ?? [];
    const history = context.history ?? [];
    const task_execution_summary = null;
    const overall_todo = context.current_todo ?? '';
    return [
      task_description,
      todos,
      history,
      task_execution_summary,
      overall_todo,
    ];
  }

  async initial_plan(
    todo: string,
    context: Record<string, any>,
    screenshot?: Image | URL | null,
    memory?: PlannerMemory | null,
    todo_index?: number | null,
  ): Promise<[PlannerOutput, string | null]> {
    /**
     * Generate initial plan for a todo.
     */
    const client = this.ensure_client();

    let screenshot_uuid: string | null = null;
    if (screenshot) {
      if (typeof screenshot === 'string') {
        screenshot_uuid = extractUuidFromUrl(screenshot);
      }
      if (!screenshot_uuid) {
        const upload = await client.putS3PresignedUrl(
          typeof (screenshot as any).read === 'function'
            ? (screenshot as Image).read()
            : (screenshot as any),
        );
        screenshot_uuid = upload.uuid;
      }
    }

    const [task_description, todos, history, task_execution_summary] =
      this.extract_memory_data(memory, context, todo_index);

    const response = await client.callWorker({
      workerId: 'oagi_first',
      overallTodo: todo,
      taskDescription: task_description,
      todos,
      history,
      currentTodoIndex: todo_index ?? undefined,
      taskExecutionSummary: task_execution_summary ?? undefined,
      currentScreenshot: screenshot_uuid ?? undefined,
    } as GenerateOption);

    return [
      this.parse_planner_output(response.response),
      response.request_id ?? null,
    ];
  }

  async reflect(
    actions: TaskerAction[],
    context: Record<string, any>,
    screenshot?: Image | URL | null,
    memory?: PlannerMemory | null,
    todo_index?: number | null,
    current_instruction?: string | null,
    reflection_interval: number = DEFAULT_REFLECTION_INTERVAL,
  ): Promise<[ReflectionOutput, string | null]> {
    /**
     * Reflect on recent actions and progress.
     */
    const client = this.ensure_client();

    let result_screenshot_uuid: string | null = null;
    if (screenshot) {
      if (typeof screenshot === 'string') {
        result_screenshot_uuid = extractUuidFromUrl(screenshot);
      }
      if (!result_screenshot_uuid) {
        const upload = await client.putS3PresignedUrl(
          typeof (screenshot as any).read === 'function'
            ? (screenshot as Image).read()
            : (screenshot as any),
        );
        result_screenshot_uuid = upload.uuid;
      }
    }

    const [
      task_description,
      todos,
      history,
      task_execution_summary,
      overall_todo,
    ] = this.extract_memory_data(memory, context, todo_index);

    const window_actions = actions.slice(
      Math.max(0, actions.length - reflection_interval),
    );

    const window_steps = window_actions.map((action, i) => ({
      step_number: i + 1,
      action_type: action.action_type,
      target: action.target ?? '',
      reasoning: action.reasoning ?? '',
    }));

    const window_screenshots = window_actions
      .map(a => a.screenshot_uuid)
      .filter((x): x is string => Boolean(x));

    const prior_notes = this.format_execution_notes(context);

    const response = await client.callWorker({
      workerId: 'oagi_follow',
      overallTodo: overall_todo,
      taskDescription: task_description,
      todos,
      history,
      currentTodoIndex: todo_index ?? undefined,
      taskExecutionSummary: task_execution_summary ?? undefined,
      currentSubtaskInstruction: current_instruction ?? undefined,
      windowSteps: window_steps as any,
      windowScreenshots: window_screenshots,
      resultScreenshot: result_screenshot_uuid ?? undefined,
      priorNotes: prior_notes,
    } as GenerateOption);

    return [
      this.parse_reflection_output(response.response),
      response.request_id ?? null,
    ];
  }

  async summarize(
    _execution_history: TaskerAction[],
    context: Record<string, any>,
    memory?: PlannerMemory | null,
    todo_index?: number | null,
  ): Promise<[string, string | null]> {
    /**
     * Generate execution summary.
     */
    const client = this.ensure_client();

    const [
      task_description,
      todos,
      history,
      task_execution_summary,
      overall_todo,
    ] = this.extract_memory_data(memory, context, todo_index);

    const latest_todo_summary =
      memory && todo_index !== undefined && todo_index !== null
        ? (memory.todo_execution_summaries[todo_index] ?? '')
        : '';

    const response: GenerateResponse = await client.callWorker({
      workerId: 'oagi_task_summary',
      overallTodo: overall_todo,
      taskDescription: task_description,
      todos,
      history,
      currentTodoIndex: todo_index ?? undefined,
      taskExecutionSummary: task_execution_summary ?? undefined,
      latestTodoSummary: latest_todo_summary,
    } as GenerateOption);

    try {
      const result = JSON.parse(response.response) as any;
      const summary = result.task_summary ?? response.response;
      return [summary, response.request_id ?? null];
    } catch {
      return [response.response, response.request_id ?? null];
    }
  }

  private format_execution_notes(context: Record<string, any>): string {
    /**
     * Format execution history notes.
     */
    if (!context.history) {
      return '';
    }

    const parts: string[] = [];
    for (const hist of context.history as any[]) {
      parts.push(
        `Todo ${hist.todo_index}: ${hist.action_count} actions, completed: ${hist.completed}`,
      );
      if (hist.summary) {
        parts.push(`Summary: ${hist.summary}`);
      }
    }

    return parts.join('\n');
  }

  private parse_planner_output(response: string): PlannerOutput {
    /**
     * Parse OAGI worker response into structured planner output.
     */
    try {
      const json_response = this.extract_json_str(response);
      const data = JSON.parse(json_response) as any;
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

  private parse_reflection_output(response: string): ReflectionOutput {
    /**
     * Parse reflection response into structured output.
     */
    try {
      const json_response = this.extract_json_str(response);
      const data = JSON.parse(json_response) as any;

      const success = (data.success ?? 'no') === 'yes';
      const new_subtask = String(data.subtask_instruction ?? '').trim();
      const continue_current = !success && !new_subtask;

      return {
        continue_current,
        new_instruction: new_subtask ? new_subtask : null,
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

  private extract_json_str(text: string): string {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}') + 1;
    if (start < 0 || end <= start) {
      return '';
    }
    return text.slice(start, end);
  }
}
