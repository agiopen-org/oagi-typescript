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
import { DEFAULT_MAX_STEPS } from './consts.js';
import { ValueError } from './errors.js';
import getLogger from './logger.js';
import type { Message, Step } from './types';

const logger = getLogger('task');

/**
 * Base class for task automation with the OAGI API.
 */
export default class Actor {
  private taskId = randomUUID();
  private taskDescription: string | null = null;
  private messageHistory: Message[] = [];
  private maxSteps = DEFAULT_MAX_STEPS;
  private currentStep = 0;
  private client: Client;

  constructor(
    private apiKey: string,
    private baseUrl: string,
    private model: string,
    private temperature?: number,
  ) {
    this.client = new Client(baseUrl, apiKey);
  }

  private validateAndIncrementStep() {
    if (!this.taskDescription) {
      throw new ValueError(
        'Task description must be set. Call init_task() first.',
      );
    }
    if (this.currentStep >= this.maxSteps) {
      throw new ValueError(
        `Max steps limit (${this.maxSteps}) reached. Call init_task() to start a new task.`,
      );
    }
    this.currentStep++;
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
    this.maxSteps = maxSteps;
    this.currentStep = 0;
    logger.info(
      `Task initialized: '${taskDescription}' (max_steps: ${maxSteps})`,
    );
  }

  /**
   * Send screenshot to the server and get the next actions.
   *
   * @param screenshot Screenshot as raw bytes
   * @param instruction Optional additional instruction for this step
   * @param temperature Sampling temperature for this step (overrides task default if provided)
   */
  async step(
    screenshot: ArrayBuffer,
    instruction?: string,
    temperature?: number,
  ): Promise<Step> {
    this.validateAndIncrementStep();
    logger.debug(`Executing step for task: '${this.taskDescription}'`);

    try {
      const response = await this.client.createMessage({
        model: this.model,
        taskDescription: this.taskDescription ?? undefined,
        taskId: this.taskId,
        instruction,
        messagesHistory: this.messageHistory,
        temperature,
        screenshot,
      });
      if (response.raw_output) {
        this.messageHistory.push({
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: response.raw_output,
            },
          ],
        });
      }
      const result: Step = {
        reason: response.reason ?? undefined,
        actions: response.actions,
        stop: response.is_complete,
      };
      if (response.is_complete) {
        logger.info('Task completed.');
      } else {
        logger.debug(`Step completed with${response.actions.length} actions`);
      }
      return result;
    } catch (err) {
      logger.error(`Error during step execution: ${err}`);
      throw err;
    }
  }
}
