/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import { AsyncActor } from '../../actor/async_.js';
import Client from '../../client.js';
import {
  DEFAULT_MAX_STEPS,
  DEFAULT_REFLECTION_INTERVAL,
  DEFAULT_STEP_DELAY,
  DEFAULT_TEMPERATURE,
  MODEL_ACTOR,
} from '../../consts.js';
import getLogger from '../../logger.js';
import type {
  URL,
  ActionEvent,
  AsyncActionHandler,
  AsyncImageProvider,
  AsyncObserver,
  Image,
  PlanEvent,
  StepEvent,
} from '../../types/index.js';
import { extractUuidFromUrl } from '../../types/url.js';

import type { AsyncAgent } from '../protocol.js';
import type { PlannerMemory } from './memory.js';
import type { ExecutionResult, TaskerAction } from './models.js';
import { Planner } from './planner.js';

const logger = getLogger('agent.tasker.taskee');

type ResettableHandler = AsyncActionHandler & { reset?: () => void };

const resetHandler = (handler: ResettableHandler) => {
  if (typeof handler.reset === 'function') {
    handler.reset();
  }
};

const sleep = (seconds: number) =>
  new Promise<void>(resolve => setTimeout(resolve, seconds * 1000));

const serializeImage = (image: Image | URL): ArrayBuffer | string => {
  if (typeof image === 'string') {
    return image;
  }
  return image.read();
};

export class TaskeeAgent implements AsyncAgent {
  /**
   * Executes a single todo with planning and reflection capabilities.
   *
   * This agent uses a Planner to:
   * 1. Convert a todo into a clear actionable instruction
   * 2. Execute the instruction using OAGI API
   * 3. Periodically reflect on progress and adjust approach
   * 4. Generate execution summaries
   */

  private api_key?: string;
  private base_url?: string;
  private model: string;
  private max_steps: number;
  private reflection_interval: number;
  private temperature: number;
  private planner: Planner;
  private external_memory?: PlannerMemory | null;
  private todo_index?: number | null;
  private step_observer?: AsyncObserver | null;
  private step_delay: number;

  private actor: AsyncActor | null = null;
  private current_todo = '';
  private current_instruction = '';
  private actions: TaskerAction[] = [];
  private total_actions = 0;
  private since_reflection = 0;
  private success = false;

  constructor(
    api_key?: string,
    base_url?: string,
    model: string = MODEL_ACTOR,
    max_steps: number = DEFAULT_MAX_STEPS,
    reflection_interval: number = DEFAULT_REFLECTION_INTERVAL,
    temperature: number = DEFAULT_TEMPERATURE,
    planner?: Planner,
    external_memory?: PlannerMemory | null,
    todo_index?: number | null,
    step_observer?: AsyncObserver | null,
    step_delay: number = DEFAULT_STEP_DELAY,
  ) {
    this.api_key = api_key;
    this.base_url = base_url;
    this.model = model;
    this.max_steps = max_steps;
    this.reflection_interval = reflection_interval;
    this.temperature = temperature;
    this.planner = planner ?? new Planner(undefined, api_key, base_url);
    this.external_memory = external_memory;
    this.todo_index = todo_index;
    this.step_observer = step_observer;
    this.step_delay = step_delay;
  }

  async execute(
    instruction: string,
    action_handler: AsyncActionHandler,
    image_provider: AsyncImageProvider,
  ): Promise<boolean> {
    /**
     * Execute the todo using planning and reflection.
     */

    // Reset handler state at todo execution start
    resetHandler(action_handler as ResettableHandler);

    this.current_todo = instruction;
    this.actions = [];
    this.total_actions = 0;
    this.since_reflection = 0;
    this.success = false;

    try {
      this.actor = new AsyncActor(
        this.api_key,
        this.base_url,
        this.model,
        this.temperature,
      );

      // Initial planning
      await this.initial_plan(image_provider);

      // Initialize the actor with the task
      await this.actor.initTask(this.current_instruction, this.max_steps);

      // Main execution loop with reinitializations
      let remaining_steps = this.max_steps;

      while (remaining_steps > 0 && !this.success) {
        const steps_taken = await this.execute_subtask(
          Math.min(this.max_steps, remaining_steps),
          action_handler,
          image_provider,
        );
        remaining_steps -= steps_taken;

        if (!this.success && remaining_steps > 0) {
          const should_continue = await this.reflect_and_decide(image_provider);
          if (!should_continue) {
            break;
          }
        }
      }

      await this.generate_summary();

      return this.success;
    } catch (e) {
      logger.error(`Error executing todo: ${e}`);
      this.record_action('error', null, String(e));
      return false;
    } finally {
      if (this.actor) {
        await this.actor.close();
        this.actor = null;
      }
    }
  }

  private async initial_plan(
    image_provider: AsyncImageProvider,
  ): Promise<void> {
    /**
     * Generate initial plan for the todo.
     */
    logger.info('Generating initial plan for todo');

    const screenshot = await image_provider();
    const context = this.get_context();

    const [plan_output, request_id] = await this.planner.initial_plan(
      this.current_todo,
      context,
      screenshot,
      this.external_memory ?? undefined,
      this.todo_index ?? undefined,
    );

    this.record_action(
      'plan',
      'initial',
      plan_output.reasoning,
      plan_output.instruction,
    );

    if (this.step_observer) {
      const event: PlanEvent = {
        type: 'plan',
        timestamp: new Date(),
        phase: 'initial',
        image: serializeImage(screenshot),
        reasoning: plan_output.reasoning,
        result: plan_output.instruction,
        request_id: request_id,
      };
      await this.step_observer.on_event(event);
    }

    this.current_instruction = plan_output.instruction;
    logger.info(`Initial instruction: ${this.current_instruction}`);
  }

  private async execute_subtask(
    max_steps: number,
    action_handler: AsyncActionHandler,
    image_provider: AsyncImageProvider,
  ): Promise<number> {
    /**
     * Execute a subtask with the current instruction.
     */
    logger.info(`Executing subtask with max ${max_steps} steps`);

    if (!this.actor) {
      return 0;
    }

    const client = new Client(this.base_url, this.api_key ?? null);

    let steps_taken = 0;

    for (let step_num = 0; step_num < max_steps; step_num++) {
      const screenshot = await image_provider();

      // Get screenshot UUID - either extract from URL or upload
      let screenshot_uuid: string | null = null;
      let screenshot_url: string | null = null;

      try {
        if (typeof screenshot === 'string') {
          screenshot_uuid = extractUuidFromUrl(screenshot);
          screenshot_url = screenshot;
        }

        if (!screenshot_uuid) {
          const bytes = (screenshot as Image).read();
          const upload = await client.putS3PresignedUrl(bytes);
          screenshot_uuid = upload.uuid;
          screenshot_url = upload.download_url;
        }
      } catch (e) {
        logger.error(`Error uploading screenshot: ${e}`);
        this.record_action('error', 'screenshot_upload', String(e));
        break;
      }

      // Get next step from OAGI using URL (avoids re-upload)
      let step;
      try {
        step = await this.actor.step(
          screenshot_url as URL,
          undefined,
          this.temperature,
        );
      } catch (e) {
        logger.error(`Error getting step from OAGI: ${e}`);
        this.record_action(
          'error',
          'oagi_step',
          String(e),
          undefined,
          screenshot_uuid,
        );
        break;
      }

      if (step.reason) {
        logger.info(`Step ${this.total_actions + 1}: ${step.reason}`);
      }

      if (this.step_observer) {
        const event: StepEvent = {
          type: 'step',
          timestamp: new Date(),
          step_num: this.total_actions + 1,
          image: serializeImage(screenshot),
          step,
          task_id: (this.actor as any).taskId,
        };
        await this.step_observer.on_event(event);
      }

      if (step.actions?.length) {
        logger.info(`Actions (${step.actions.length}):`);
        for (const action of step.actions) {
          const count_suffix =
            action.count && action.count > 1 ? ` x${action.count}` : '';
          logger.info(`  [${action.type}] ${action.argument}${count_suffix}`);
        }

        for (const action of step.actions) {
          this.record_action(
            String(action.type).toLowerCase(),
            action.argument,
            step.reason,
            undefined,
            screenshot_uuid,
          );
        }

        let error: string | null = null;
        try {
          await action_handler(step.actions);
        } catch (e) {
          error = String(e);
          throw e;
        } finally {
          if (this.step_observer) {
            const event: ActionEvent = {
              type: 'action',
              timestamp: new Date(),
              step_num: this.total_actions + 1,
              actions: step.actions,
              error,
            };
            await this.step_observer.on_event(event);
          }
        }

        this.total_actions += step.actions.length;
        this.since_reflection += step.actions.length;
      }

      if (this.step_delay > 0) {
        await sleep(this.step_delay);
      }

      steps_taken += 1;

      if (step.stop) {
        logger.info('OAGI signaled task completion');
        break;
      }

      if (this.since_reflection >= this.reflection_interval) {
        logger.info('Reflection interval reached');
        break;
      }
    }

    return steps_taken;
  }

  private async reflect_and_decide(
    image_provider: AsyncImageProvider,
  ): Promise<boolean> {
    /**
     * Reflect on progress and decide whether to continue.
     */
    logger.info('Reflecting on progress');

    const screenshot = await image_provider();

    const context = this.get_context();
    (context as any).current_todo = this.current_todo;

    const recent_actions = this.actions.slice(
      Math.max(0, this.actions.length - this.since_reflection),
    );

    const [reflection, request_id] = await this.planner.reflect(
      recent_actions,
      context,
      screenshot,
      this.external_memory ?? undefined,
      this.todo_index ?? undefined,
      this.current_instruction,
      this.reflection_interval,
    );

    this.record_action(
      'reflect',
      null,
      reflection.reasoning,
      reflection.continue_current ? 'continue' : 'pivot',
    );

    if (this.step_observer) {
      const decision = reflection.success_assessment
        ? 'success'
        : reflection.continue_current
          ? 'continue'
          : 'pivot';

      const event: PlanEvent = {
        type: 'plan',
        timestamp: new Date(),
        phase: 'reflection',
        image: serializeImage(screenshot),
        reasoning: reflection.reasoning,
        result: decision,
        request_id,
      };
      await this.step_observer.on_event(event);
    }

    if (reflection.success_assessment) {
      this.success = true;
      logger.info('Reflection indicates task is successful');
      return false;
    }

    this.since_reflection = 0;

    if (!reflection.continue_current && reflection.new_instruction) {
      logger.info(`Pivoting to new instruction: ${reflection.new_instruction}`);
      this.current_instruction = reflection.new_instruction;
      if (this.actor) {
        await this.actor.initTask(this.current_instruction, this.max_steps);
      }
      return true;
    }

    return reflection.continue_current;
  }

  private async generate_summary(): Promise<void> {
    /** Generate execution summary. */
    logger.info('Generating execution summary');

    const context = this.get_context();
    (context as any).current_todo = this.current_todo;

    const [summary, request_id] = await this.planner.summarize(
      this.actions,
      context,
      this.external_memory ?? undefined,
      this.todo_index ?? undefined,
    );

    this.record_action('summary', null, summary);

    if (this.step_observer) {
      const event: PlanEvent = {
        type: 'plan',
        timestamp: new Date(),
        phase: 'summary',
        image: null,
        reasoning: summary,
        result: null,
        request_id,
      };
      await this.step_observer.on_event(event);
    }

    logger.info(`Execution summary: ${summary}`);
  }

  private record_action(
    action_type: string,
    target: string | null,
    reasoning?: string | null,
    result?: string | null,
    screenshot_uuid?: string | null,
  ): void {
    /**
     * Record an action to the history.
     */
    const action: TaskerAction = {
      timestamp: new Date().toISOString(),
      action_type,
      target,
      reasoning,
      result,
      details: {},
      screenshot_uuid,
    };
    this.actions.push(action);
  }

  private get_context(): Record<string, any> {
    /** Get execution context. */
    if (this.external_memory) {
      return this.external_memory.get_context() as any;
    }
    return {};
  }

  return_execution_results(): ExecutionResult {
    /**
     * Return the execution results.
     */
    let summary = '';
    for (let i = this.actions.length - 1; i >= 0; i--) {
      if (this.actions[i]!.action_type === 'summary') {
        summary = this.actions[i]!.reasoning ?? '';
        break;
      }
    }

    return {
      success: this.success,
      actions: this.actions,
      summary,
      total_steps: this.total_actions,
    };
  }
}
