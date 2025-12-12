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
import { DEFAULT_MAX_STEPS, MAX_STEPS_ACTOR, MAX_STEPS_THINKER, MODEL_THINKER } from '../consts.js';
import { ValueError } from '../errors.js';
import getLogger from '../logger.js';
import type Client from '../client.js';
import { buildPrompt } from '../utils/index.js';
import type { URL, Image, Step } from '../types/index.js';
import type { ChatCompletionMessageParam } from 'openai/resources.js';

const logger = getLogger('actor.base');

export type Screenshot = Image | URL | ArrayBuffer;

export class BaseActor {
  /**
   * Client-side generated UUID
   */
  protected taskId: string = randomUUID();
  protected taskDescription: string | null = null;
  protected messageHistory: ChatCompletionMessageParam[] = [];
  protected maxSteps: number = DEFAULT_MAX_STEPS;
  protected currentStep = 0;

  // Client will be set by subclasses
  protected client: Client | null = null;

  constructor(
    protected model: string,
    protected temperature?: number,
  ) {}

  protected validateMaxSteps(maxSteps: number): number {
    const limit = this.model === MODEL_THINKER ? MAX_STEPS_THINKER : MAX_STEPS_ACTOR;
    if (maxSteps > limit) {
      logger.warn(
        `max_steps (${maxSteps}) exceeds limit for model '${this.model}'. Capping to ${limit}.`,
      );
      return limit;
    }
    return maxSteps;
  }

  protected prepareInitTask(taskDesc: string, maxSteps: number) {
    this.taskId = randomUUID();
    this.taskDescription = taskDesc;
    this.messageHistory = [];
    this.maxSteps = this.validateMaxSteps(maxSteps);
    this.currentStep = 0;
    logger.info(`Task initialized: '${taskDesc}' (max_steps: ${this.maxSteps})`);
  }

  protected validateAndIncrementStep() {
    if (!this.taskDescription) {
      throw new ValueError('Task description must be set. Call initTask() first.');
    }
    if (this.currentStep >= this.maxSteps) {
      throw new ValueError(
        `Max steps limit (${this.maxSteps}) reached. Call initTask() to start a new task.`,
      );
    }
    this.currentStep++;
  }

  protected getTemperature(temperature?: number): number | undefined {
    return temperature !== undefined ? temperature : this.temperature;
  }

  protected prepareScreenshot(screenshot: Image | ArrayBuffer): ArrayBuffer {
    if (typeof (screenshot as Image).read === 'function') {
      return (screenshot as Image).read();
    }
    return screenshot as ArrayBuffer;
  }

  protected getScreenshotUrl(screenshot: Screenshot): string | null {
    if (typeof screenshot === 'string') return screenshot;
    return null;
  }

  protected async ensureScreenshotUrlAsync(screenshot: Screenshot, client: Client): Promise<string> {
    let screenshotUrl = this.getScreenshotUrl(screenshot);
    if (screenshotUrl === null) {
      const screenshotBytes = this.prepareScreenshot(screenshot as Image | ArrayBuffer);
      const uploadResponse = await client.putS3PresignedUrl(screenshotBytes);
      screenshotUrl = uploadResponse.download_url;
    }
    return screenshotUrl;
  }

  protected addUserMessageToHistory(screenshotUrl: string, prompt?: string) {
    const content: any[] = [];
    if (prompt) content.push({ type: 'text', text: prompt });
    content.push({ type: 'image_url', image_url: { url: screenshotUrl } });

    this.messageHistory.push({ role: 'user', content } as ChatCompletionMessageParam);
  }

  protected addAssistantMessageToHistory(rawOutput: string) {
    if (rawOutput) {
      // Keep parity with python: store raw output
      this.messageHistory.push({ role: 'assistant', content: rawOutput } as ChatCompletionMessageParam);
    }
  }

  protected buildStepPrompt(): string | undefined {
    if (this.messageHistory.length === 0) {
      return buildPrompt(this.taskDescription!);
    }
  }

  protected logStepCompletion(step: Step, prefix = '') {
    if (step.stop) {
      logger.info(`${prefix}Task completed.`);
    } else {
      logger.debug(`${prefix}Step completed with ${step.actions.length} actions`);
    }
  }

  protected logStepExecution(prefix = '') {
    logger.debug(`Executing ${prefix}step for task: '${this.taskDescription}'`);
  }

  protected handleStepError(error: unknown, prefix = ''): never {
    logger.error(`Error during ${prefix}step execution: ${error}`);
    throw error;
  }
}

export class BaseAutoMode {
  logAutoModeStart(taskDesc: string, maxSteps: number, prefix = '') {
    logger.info(
      `Starting ${prefix}auto mode for task: '${taskDesc}' (max_steps: ${maxSteps})`,
    );
  }

  logAutoModeStep(stepNum: number, maxSteps: number, prefix = '') {
    logger.debug(`${prefix.charAt(0).toUpperCase()}${prefix.slice(1)}auto mode step ${stepNum}/${maxSteps}`);
  }

  logAutoModeActions(actionCount: number, prefix = '') {
    const verb = prefix.includes('async') ? 'asynchronously' : '';
    logger.debug(`Executing ${actionCount} actions ${verb}`.trim());
  }

  logAutoModeCompletion(steps: number, prefix = '') {
    logger.info(
      `${prefix.charAt(0).toUpperCase()}${prefix.slice(1)}auto mode completed successfully after ${steps} steps`,
    );
  }

  logAutoModeMaxSteps(maxSteps: number, prefix = '') {
    logger.warn(
      `${prefix.charAt(0).toUpperCase()}${prefix.slice(1)}auto mode reached max steps (${maxSteps}) without completion`,
    );
  }
}
