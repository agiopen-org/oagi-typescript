/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import { AsyncActor } from '../actor/async_.js';
import {
  DEFAULT_MAX_STEPS,
  DEFAULT_STEP_DELAY,
  DEFAULT_TEMPERATURE,
  MODEL_ACTOR,
} from '../consts.js';
import getLogger from '../logger.js';
import type {
  ActionEvent,
  AsyncActionHandler,
  AsyncImageProvider,
  AsyncObserver,
  Image,
  StepEvent,
  URL,
} from '../types/index.js';

const logger = getLogger('agent.default');

type ResettableHandler = AsyncActionHandler & { reset?: () => void };

const resetHandler = (handler: ResettableHandler) => {
  if (typeof handler.reset === 'function') {
    handler.reset();
  }
};

const sleep = (seconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, seconds * 1000));

const serializeImage = (image: Image | URL): ArrayBuffer | string => {
  if (typeof image === 'string') {
    return image;
  }
  return image.read();
};

export class AsyncDefaultAgent {
  /** Default asynchronous agent implementation using OAGI client. */

  private api_key?: string;
  private base_url?: string;
  private model: string;
  private max_steps: number;
  private temperature?: number;
  private step_observer?: AsyncObserver;
  private step_delay: number;

  constructor(
    api_key?: string,
    base_url?: string,
    model: string = MODEL_ACTOR,
    max_steps: number = DEFAULT_MAX_STEPS,
    temperature: number | undefined = DEFAULT_TEMPERATURE,
    step_observer?: AsyncObserver,
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
    action_handler: AsyncActionHandler,
    image_provider: AsyncImageProvider,
  ): Promise<boolean> {
    const actor = new AsyncActor(this.api_key, this.base_url, this.model);

    try {
      logger.info(`Starting async task execution: ${instruction}`);
      await actor.initTask(instruction, this.max_steps);

      // Reset handler state at automation start
      resetHandler(action_handler as ResettableHandler);

      for (let i = 0; i < this.max_steps; i++) {
        const step_num = i + 1;
        logger.debug(`Executing step ${step_num}/${this.max_steps}`);

        // Capture current state
        const image = await image_provider();

        // Get next step from OAGI
        const step = await actor.step(image as any, undefined, this.temperature);

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
            image: serializeImage(image),
            step,
            task_id: (actor as any).taskId,
          };
          await this.step_observer.on_event(event);
        }

        // Execute actions if any
        if (step.actions?.length) {
          logger.info(`Actions (${step.actions.length}):`);
          for (const action of step.actions) {
            const count_suffix = action.count && action.count > 1 ? ` x${action.count}` : '';
            logger.info(`  [${action.type}] ${action.argument}${count_suffix}`);
          }

          let error: string | null = null;
          try {
            await action_handler(step.actions);
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
                error,
              };
              await this.step_observer.on_event(event);
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
    } finally {
      await actor.close();
    }
  }
}
