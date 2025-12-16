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
import {
  DEFAULT_MAX_STEPS,
  DEFAULT_STEP_DELAY,
  DEFAULT_TEMPERATURE,
  MODEL_ACTOR,
} from '../consts.js';
import getLogger from '../logger.js';
import type {
  ActionEvent,
  ActionHandler,
  ImageProvider,
  StepEvent,
  StepObserver,
} from '../types/index.js';
import { Agent } from './index.js';

const logger = getLogger('agent.default');

type ResettableHandler = ActionHandler & { reset?: () => void };

const resetHandler = (handler: ResettableHandler) => {
  if (typeof handler.reset === 'function') {
    handler.reset();
  }
};

const sleep = (seconds: number) =>
  new Promise<void>(resolve => setTimeout(resolve, seconds * 1000));

export class DefaultAgent implements Agent {
  /** Default asynchronous agent implementation using OAGI client. */

  private api_key?: string;
  private base_url?: string;
  private model: string;
  private max_steps: number;
  private temperature?: number;
  private step_observer?: StepObserver;
  private step_delay: number;

  constructor(
    api_key?: string,
    base_url?: string,
    model: string = MODEL_ACTOR,
    max_steps: number = DEFAULT_MAX_STEPS,
    temperature: number | undefined = DEFAULT_TEMPERATURE,
    step_observer?: StepObserver,
    step_delay: number = DEFAULT_STEP_DELAY,
  ) {
    this.api_key = api_key;
    this.base_url = base_url;
    this.model = model;
    this.max_steps = max_steps;
    this.temperature = temperature;
    this.step_observer = step_observer;
    this.step_delay = step_delay;
  }

  async execute(
    instruction: string,
    action_handler: ActionHandler,
    image_provider: ImageProvider,
  ): Promise<boolean> {
    const actor = new Actor(this.api_key, this.base_url, this.model);

    logger.info(`Starting async task execution: ${instruction}`);
    await actor.initTask(instruction, this.max_steps);

    // Reset handler state at automation start
    resetHandler(action_handler);

    for (let i = 0; i < this.max_steps; i++) {
      const step_num = i + 1;
      logger.debug(`Executing step ${step_num}/${this.max_steps}`);

      // Capture current state
      const image = await image_provider.provide();

      // Get next step from OAGI
      const step = await actor.step(image, undefined, this.temperature);

      // Log reasoning
      if (step.reason) {
        logger.info(`Step ${step_num}: ${step.reason}`);
      }

      // Emit step event
      if (this.step_observer) {
        const event: StepEvent = {
          type: 'step',
          timestamp: new Date(),
          step_num,
          image,
          step,
          task_id: (actor as any).taskId,
        };
        await this.step_observer.onEvent(event);
      }

      // Execute actions if any
      if (step.actions?.length) {
        logger.info(`Actions (${step.actions.length}):`);
        for (const action of step.actions) {
          const count_suffix =
            action.count && action.count > 1 ? ` x${action.count}` : '';
          logger.info(`  [${action.type}] ${action.argument}${count_suffix}`);
        }

        let error: string | null = null;
        try {
          await action_handler.handle(step.actions);
        } catch (e) {
          error = String(e);
          throw e;
        } finally {
          // Emit action event
          if (this.step_observer) {
            const event: ActionEvent = {
              type: 'action',
              timestamp: new Date(),
              step_num,
              actions: step.actions,
              error: error ?? undefined,
            };
            await this.step_observer.onEvent(event);
          }
        }
      }

      // Wait after actions before next screenshot
      if (this.step_delay > 0) {
        await sleep(this.step_delay);
      }

      // Check if task is complete
      if (step.stop) {
        logger.info(`Task completed successfully after ${step_num} steps`);
        return true;
      }
    }

    logger.warn(
      `Task reached max steps (${this.max_steps}) without completion`,
    );
    return false;
  }
}
