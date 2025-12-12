/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import Client from '../client.js';
import { DEFAULT_MAX_STEPS, MODEL_ACTOR } from '../consts.js';
import type { Step, Image, URL } from '../types/index.js';
import { BaseActor } from './base.js';

type Screenshot = Image | URL | ArrayBuffer;

export class AsyncActor extends BaseActor {
  protected override client: Client;

  /** Async base class for task automation with the OAGI API. */
  constructor(
    apiKey?: string,
    baseUrl?: string,
    model: string = MODEL_ACTOR,
    temperature?: number,
  ) {
    super(model, temperature);
    this.client = new Client(baseUrl, apiKey);
  }

  /**
   * Initialize a new task with the given description.
   *
   * @param taskDesc Task description
   * @param maxSteps Maximum number of steps allowed
   */
  async initTask(taskDesc: string, maxSteps: number = DEFAULT_MAX_STEPS) {
    this.prepareInitTask(taskDesc, maxSteps);
  }

  /**
   * Send screenshot to the server and get the next actions.
   *
   * @param screenshot Screenshot as Image object, URL string, or raw bytes
   * @param instruction Optional additional instruction for this step (currently unused)
   * @param temperature Sampling temperature for this step (overrides task default if provided)
   *
   * @returns Step: The actions and reasoning for this step
   */
  async step(
    screenshot: Screenshot,
    _instruction?: string,
    temperature?: number,
  ): Promise<Step> {
    this.validateAndIncrementStep();
    this.logStepExecution('async ');

    try {
      const screenshotUrl = await this.ensureScreenshotUrlAsync(screenshot, this.client);
      this.addUserMessageToHistory(screenshotUrl, this.buildStepPrompt());

      const [step, rawOutput] = await this.client.chatCompletions(
        this.model,
        this.messageHistory,
        this.getTemperature(temperature),
        this.taskId,
      );

      this.addAssistantMessageToHistory(rawOutput);
      this.logStepCompletion(step, 'Async ');
      return step;
    } catch (err) {
      this.handleStepError(err, 'async ');
    }
  }

  /** Close the underlying HTTP client to free resources. */
  async close() {
    // No-op (OpenAI client uses fetch; no persistent sockets to close)
  }
}

/**
 * Deprecated: Use AsyncActor instead.
 *
 * This class is deprecated and will be removed in a future version.
 * Please use AsyncActor instead.
 */
export class AsyncTask extends AsyncActor {
  constructor(
    apiKey?: string,
    baseUrl?: string,
    model: string = MODEL_ACTOR,
    temperature?: number,
  ) {
    process.emitWarning(
      'AsyncTask is deprecated and will be removed in a future version. Please use AsyncActor instead.',
      {
        type: 'DeprecationWarning',
      },
    );
    super(apiKey, baseUrl, model, temperature);
  }
}
