/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import { randomUUID } from 'crypto';
import Client from './client.js';
import {
  DEFAULT_MAX_STEPS,
  MAX_STEPS_ACTOR,
  MAX_STEPS_THINKER,
  MODEL_ACTOR,
  MODEL_THINKER,
} from './consts.js';
import { ValueError } from './errors.js';
import getLogger from './logger.js';
import { buildPrompt } from './utils/index.js';
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam,
} from 'openai/resources.js';
import type { Step } from './types/index.js';

const logger = getLogger('task');

/**
 * Base class for task automation with the OAGI API.
 */
export default class Actor {
  /**
   * Client-side generated UUID
   */
  private taskId = randomUUID();
  private taskDescription: string | null = null;
  /**
   * OpenAI-compatible message history
   */
  private messageHistory: ChatCompletionMessageParam[] = [];
  private maxSteps = DEFAULT_MAX_STEPS;
  /**
   * Current step counter
   */
  private currentStep = 0;
  private client: Client;

  constructor(
    apiKey?: string,
    baseUrl?: string,
    private model = MODEL_ACTOR,
    private temperature?: number,
  ) {
    this.client = new Client(baseUrl, apiKey);
  }

  private validateAndIncrementStep() {
    if (!this.taskDescription) {
      throw new ValueError(
        'Task description must be set. Call initTask() first.',
      );
    }
    if (this.currentStep >= this.maxSteps) {
      throw new ValueError(
        `Max steps limit (${this.maxSteps}) reached. Call initTask() to start a new task.`,
      );
    }
    this.currentStep++;
  }

  /**
   * Get screenshot URL, uploading to S3 if needed (async version).
   * @param screenshot Screenshot as URL string, or raw bytes
   * @returns Screenshot URL (either direct or from S3 upload)
   */
  private async ensureScreenshotUrl(screenshot: string | ArrayBuffer) {
    if (typeof screenshot === 'string') return screenshot;
    const uploadResponse = await this.client.putS3PresignedUrl(screenshot);
    return uploadResponse.download_url;
  }

  /**
   * Add user message with screenshot to message history.
   *
   * @param screenshot URL of the screenshot
   * @param prompt Optional prompt text (for first message only)
   */
  private addUserMessageToHistory(screenshot: string, prompt?: string) {
    const content: ChatCompletionContentPart[] = [];
    if (prompt) {
      content.push({
        type: 'text',
        text: prompt,
      });
    }
    content.push({
      type: 'image_url',
      image_url: {
        url: screenshot,
      },
    });
    this.messageHistory.push({ role: 'user', content });
  }

  /**
   * Build prompt for first message only.
   */
  private buildStepPrompt() {
    if (this.messageHistory.length === 0) {
      return buildPrompt(this.taskDescription!);
    }
  }

  /**
   * Initialize a new task with the given description.
   *
   * @param taskDescription Task description
   * @param maxSteps Maximum number of steps allowed
   */
  async initTask(
    taskDescription: string,
    maxSteps: number = DEFAULT_MAX_STEPS,
  ) {
    this.taskId = randomUUID();
    this.taskDescription = taskDescription;
    this.messageHistory = [];
    const limit =
      this.model == MODEL_THINKER ? MAX_STEPS_THINKER : MAX_STEPS_ACTOR;
    if (maxSteps > limit) {
      logger.warn(
        `max_steps (${maxSteps}) exceeds limit for model '${this.model}'. Capping to ${limit}.`,
      );
      maxSteps = limit;
    }
    this.maxSteps = maxSteps;
    this.currentStep = 0;
    logger.info(
      `Task initialized: '${taskDescription}' (max_steps: ${maxSteps})`,
    );
  }

  /**
   * Send screenshot to the server and get the next actions.
   *
   * @param screenshot Screenshot as URL string, or raw bytes
   * @param instruction Optional additional instruction for this step (currently unused)
   * @param temperature Sampling temperature for this step (overrides task default if provided)
   */
  async step(
    screenshot: string | ArrayBuffer,
    _instruction?: string,
    temperature?: number,
  ): Promise<Step> {
    this.validateAndIncrementStep();
    logger.debug(`Executing step for task: '${this.taskDescription}'`);

    try {
      const screenshotUrl = await this.ensureScreenshotUrl(screenshot);
      this.addUserMessageToHistory(screenshotUrl, this.buildStepPrompt());

      const [step, rawOutput] = await this.client.chatCompletions(
        this.model,
        this.messageHistory,
        temperature ?? this.temperature,
        this.taskId,
      );
      if (rawOutput) {
        this.messageHistory.push({
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: rawOutput,
            },
          ],
        });
      }
      if (step.stop) {
        logger.info('Task completed.');
      } else {
        logger.debug(`Step completed with${step.actions.length} actions`);
      }

      return step;
    } catch (err) {
      logger.error(`Error during step execution: ${err}`);
      throw err;
    }
  }
}
