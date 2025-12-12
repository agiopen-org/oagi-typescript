/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import { DEFAULT_MAX_STEPS, MODEL_ACTOR } from '../consts.js';
import type { AsyncActionHandler, AsyncImageProvider } from '../types/index.js';
import { AsyncActor } from './async_.js';
import { BaseAutoMode } from './base.js';

/**
 * Deprecated: This class is deprecated and will be removed in a future version.
 *
 * Async task implementation with automatic mode for short-duration tasks.
 * Please use AsyncActor directly with custom automation logic instead.
 */
export class AsyncShortTask extends AsyncActor {
  private auto = new BaseAutoMode();

  constructor(
    apiKey?: string,
    baseUrl?: string,
    model: string = MODEL_ACTOR,
    temperature?: number,
  ) {
    process.emitWarning(
      'AsyncShortTask is deprecated and will be removed in a future version. Please use AsyncActor with custom automation logic instead.',
      { type: 'DeprecationWarning' },
    );
    super(apiKey, baseUrl, model, temperature);
  }

  /**
   * Run the task in automatic mode with the provided executor and image provider.
   *
   * @param taskDesc Task description
   * @param maxSteps Maximum number of steps
   * @param executor Async handler to execute actions
   * @param imageProvider Async provider for screenshots
   * @param temperature Sampling temperature for all steps (overrides task default if provided)
   */
  async autoMode(
    taskDesc: string,
    maxSteps: number = DEFAULT_MAX_STEPS,
    executor?: AsyncActionHandler,
    imageProvider?: AsyncImageProvider,
    temperature?: number,
  ): Promise<boolean> {
    this.auto.logAutoModeStart(taskDesc, maxSteps, 'async ');

    await this.initTask(taskDesc, maxSteps);

    for (let i = 0; i < maxSteps; i++) {
      this.auto.logAutoModeStep(i + 1, maxSteps, 'async ');
      const image = imageProvider ? await imageProvider() : (() => { throw new Error('imageProvider is required'); })();
      const step = await this.step(image as any, undefined, temperature);
      if (executor) {
        this.auto.logAutoModeActions(step.actions.length, 'async ');
        await executor(step.actions);
      }
      if (step.stop) {
        this.auto.logAutoModeCompletion(i + 1, 'async ');
        return true;
      }
    }

    this.auto.logAutoModeMaxSteps(maxSteps, 'async ');
    return false;
  }
}
