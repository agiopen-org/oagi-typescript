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

export class Actor extends BaseActor {
  /** Async HTTP client (the TypeScript SDK is async-only). */
  protected override client: Client;

  /**
   * Base class for task automation with the OAGI API.
   */
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
  initTask(taskDesc: string, maxSteps: number = DEFAULT_MAX_STEPS) {
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
    this.logStepExecution();

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
      this.logStepCompletion(step);
      return step;
    } catch (err) {
      this.handleStepError(err, '');
    }
  }

  /** Close the underlying HTTP client to free resources. */
  async close() {
    // No-op (OpenAI client uses fetch; no persistent sockets to close)
  }
}

/**
 * Deprecated: Use Actor instead.
 *
 * This class is deprecated and will be removed in a future version.
 * Please use Actor instead.
 */
export class Task extends Actor {
  constructor(
    apiKey?: string,
    baseUrl?: string,
    model: string = MODEL_ACTOR,
    temperature?: number,
  ) {
    process.emitWarning(
      'Task is deprecated and will be removed in a future version. Please use Actor instead.',
      {
        type: 'DeprecationWarning',
      },
    );
    super(apiKey, baseUrl, model, temperature);
  }
}
