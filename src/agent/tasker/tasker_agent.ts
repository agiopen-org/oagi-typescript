/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import {
  DEFAULT_MAX_STEPS_TASKER,
  DEFAULT_REFLECTION_INTERVAL,
  DEFAULT_STEP_DELAY,
  DEFAULT_TEMPERATURE,
  MODEL_ACTOR,
} from '../../consts.js';
import getLogger from '../../logger.js';
import type {
  AsyncActionHandler,
  AsyncImageProvider,
  AsyncObserver,
  SplitEvent,
} from '../../types/index.js';

import type { AsyncAgent } from '../protocol.js';
import { PlannerMemory } from './memory.js';
import { TodoStatus } from './models.js';
import { Planner } from './planner.js';
import { TaskeeAgent } from './taskee_agent.js';

const logger = getLogger('agent.tasker.tasker');

type ResettableHandler = AsyncActionHandler & { reset?: () => void };

const resetHandler = (handler: ResettableHandler) => {
  if (typeof handler.reset === 'function') {
    handler.reset();
  }
};

export class TaskerAgent implements AsyncAgent {
  /**
   * Hierarchical agent that manages multi-todo workflows.
   *
   * This agent orchestrates the execution of multiple todos by:
   * 1. Managing a workflow with todos and deliverables
   * 2. Executing todos sequentially using TaskeeAgent
   * 3. Tracking progress and updating memory
   * 4. Sharing context between todos for informed execution
   */

  private api_key?: string;
  private base_url?: string;
  private model: string;
  private max_steps: number;
  private temperature: number;
  private reflection_interval: number;
  private planner: Planner;
  private step_observer?: AsyncObserver | null;
  private step_delay: number;

  private memory: PlannerMemory = new PlannerMemory();
  private current_taskee_agent: TaskeeAgent | null = null;
  private _current_todo_index: number = -1;

  constructor(
    api_key?: string,
    base_url?: string,
    model: string = MODEL_ACTOR,
    max_steps: number = DEFAULT_MAX_STEPS_TASKER,
    temperature: number = DEFAULT_TEMPERATURE,
    reflection_interval: number = DEFAULT_REFLECTION_INTERVAL,
    planner?: Planner,
    step_observer?: AsyncObserver | null,
    step_delay: number = DEFAULT_STEP_DELAY,
  ) {
    this.api_key = api_key;
    this.base_url = base_url;
    this.model = model;
    this.max_steps = max_steps;
    this.temperature = temperature;
    this.reflection_interval = reflection_interval;
    this.planner = planner ?? new Planner(undefined, api_key, base_url);
    this.step_observer = step_observer;
    this.step_delay = step_delay;
  }

  set_task(task: string, todos: string[]): void {
    /**
     * Set the task and todos for the workflow.
     */
    this.memory.set_task(task, todos);
    logger.info(`Task set with ${todos.length} todos`);
  }

  async execute(
    _instruction: string,
    action_handler: AsyncActionHandler,
    image_provider: AsyncImageProvider,
  ): Promise<boolean> {
    /**
     * Execute the multi-todo workflow.
     */

    // Reset handler state at automation start
    resetHandler(action_handler as ResettableHandler);

    let overall_success = true;

    while (true) {
      const todo_info = this.prepare();

      if (!todo_info) {
        logger.info('No more todos to execute');
        break;
      }

      const [todo, todo_index] = todo_info;
      logger.info(`Executing todo ${todo_index}: ${todo.description}`);

      if (this.step_observer) {
        const event: SplitEvent = {
          type: 'split',
          timestamp: new Date(),
          label: `Start of todo ${todo_index + 1}: ${todo.description}`,
        };
        await this.step_observer.on_event(event);
      }

      const success = await this.execute_todo(
        todo_index,
        action_handler,
        image_provider,
      );

      if (this.step_observer) {
        const event: SplitEvent = {
          type: 'split',
          timestamp: new Date(),
          label: `End of todo ${todo_index + 1}: ${todo.description}`,
        };
        await this.step_observer.on_event(event);
      }

      if (!success) {
        logger.warn(`Todo ${todo_index} failed`);
        overall_success = false;

        const current_status = this.memory.todos[todo_index]!.status;
        if (current_status === TodoStatus.IN_PROGRESS) {
          logger.error('Todo failed with exception, stopping execution');
          break;
        }
      }

      this.update_task_summary();
    }

    const status_summary = this.memory.get_todo_status_summary();
    logger.info(
      `Workflow complete. Status summary: ${JSON.stringify(status_summary)}`,
    );

    return overall_success;
  }

  private prepare(): [any, number] | null {
    /**
     * Prepare for the next todo execution.
     */
    const [todo, todo_index] = this.memory.get_current_todo();

    if (!todo) {
      return null;
    }

    this.current_taskee_agent = new TaskeeAgent(
      this.api_key,
      this.base_url,
      this.model,
      this.max_steps,
      this.reflection_interval,
      this.temperature,
      this.planner,
      this.memory,
      todo_index,
      this.step_observer ?? undefined,
      this.step_delay,
    );

    this._current_todo_index = todo_index;
    void this._current_todo_index;

    if (todo.status === TodoStatus.PENDING) {
      this.memory.update_todo(todo_index, TodoStatus.IN_PROGRESS);
    }

    logger.info(`Prepared taskee agent for todo ${todo_index}`);

    return [todo, todo_index];
  }

  private async execute_todo(
    todo_index: number,
    action_handler: AsyncActionHandler,
    image_provider: AsyncImageProvider,
  ): Promise<boolean> {
    /**
     * Execute a single todo using the todo agent.
     */
    if (!this.current_taskee_agent || todo_index < 0) {
      logger.error('No taskee agent prepared');
      return false;
    }

    const todo = this.memory.todos[todo_index]!;

    try {
      const success = await this.current_taskee_agent.execute(
        todo.description,
        action_handler,
        image_provider,
      );

      const results = this.current_taskee_agent.return_execution_results();
      this.update_memory_from_execution(todo_index, results, success);

      return success;
    } catch (e) {
      logger.error(`Error executing todo ${todo_index}: ${e}`);
      this.memory.update_todo(
        todo_index,
        TodoStatus.IN_PROGRESS,
        `Execution failed: ${String(e)}`,
      );
      return false;
    }
  }

  private update_memory_from_execution(
    todo_index: number,
    results: any,
    success: boolean,
  ): void {
    /**
     * Update memory based on execution results.
     */
    const status = success ? TodoStatus.COMPLETED : TodoStatus.IN_PROGRESS;

    this.memory.update_todo(todo_index, status, results.summary);

    this.memory.add_history(
      todo_index,
      results.actions,
      results.summary,
      success,
    );

    if (success) {
      if (this.memory.task_execution_summary) {
        this.memory.task_execution_summary += `\n- Completed todo ${todo_index}: ${results.summary}`;
      } else {
        this.memory.task_execution_summary = `- Completed todo ${todo_index}: ${results.summary}`;
      }
    }

    logger.info(
      `Updated memory for todo ${todo_index}: status=${status}, actions=${results.actions.length}`,
    );
  }

  private update_task_summary(): void {
    /** Update the overall task execution summary. */
    const status_summary = this.memory.get_todo_status_summary();
    const completed = status_summary.completed ?? 0;
    const total = this.memory.todos.length;

    const summary_parts: string[] = [
      `Progress: ${completed}/${total} todos completed`,
    ];

    for (const history of this.memory.history.slice(
      Math.max(0, this.memory.history.length - 3),
    )) {
      if (history.completed && history.summary) {
        summary_parts.push(
          `- Todo ${history.todo_index}: ${history.summary.slice(0, 100)}`,
        );
      }
    }

    this.memory.task_execution_summary = summary_parts.join('\n');
  }

  get_memory(): PlannerMemory {
    /** Get the current memory state. */
    return this.memory;
  }

  append_todo(description: string): void {
    /**
     * Dynamically append a new todo to the workflow.
     */
    this.memory.append_todo(description);
    logger.info(`Appended new todo: ${description}`);
  }
}
