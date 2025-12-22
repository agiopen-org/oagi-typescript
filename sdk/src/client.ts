/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import OpenAI from 'openai';
import {
  API_KEY_HELP_URL,
  API_V1_FILE_UPLOAD_ENDPOINT,
  API_V1_GENERATE_ENDPOINT,
  DEFAULT_BASE_URL,
  DEFAULT_MAX_RETRIES,
  HTTP_CLIENT_TIMEOUT,
} from './consts.js';
import {
  APIError,
  AuthenticationError,
  ConfigurationError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  RequestTimeoutError,
  ServerError,
  ValidationError,
  ValueError,
} from './errors.js';
import getLogger, { logTraceOnFailure } from './logger.js';
import {
  GenerateResponseSchema,
  UploadFileResponseSchema,
} from './types/index.js';
import type {
  ChatCompletionMessageParam,
  CompletionUsage,
} from 'openai/resources.js';
import type {
  ErrorResponse,
  GenerateOption,
  GenerateResponse,
  Step,
  UploadFileResponse,
} from './types';
import { parseRawOutput } from './utils/index.js';

const logger = getLogger('client');

export interface ClientOptions {
  baseURL?: string;
  apiKey?: string;
  maxRetries?: number;
}

/**
 * HTTP client for the OAGI API.
 */
export default class Client {
  private baseURL: string;
  private apiKey?: string;
  private timeout = HTTP_CLIENT_TIMEOUT;
  private client: OpenAI;

  constructor(options: ClientOptions);
  constructor(baseURL?: string, apiKey?: string, maxRetries?: number);
  constructor(
    baseURL?: ClientOptions | string,
    apiKey?: string,
    maxRetries?: number,
  ) {
    if (typeof baseURL === 'object') {
      ({ baseURL, apiKey, maxRetries } = baseURL);
    }
    baseURL ??= process.env.OAGI_BASE_URL ?? DEFAULT_BASE_URL;
    apiKey ??= process.env.OAGI_API_KEY;
    maxRetries ??= DEFAULT_MAX_RETRIES;

    this.baseURL = baseURL;
    this.apiKey = apiKey;
    if (!apiKey) {
      throw new ConfigurationError(
        `OAGI API key must be provided either as 'api_key' parameter or OAGI_API_KEY environment variable. Get your API key at ${API_KEY_HELP_URL}`,
      );
    }
    this.client = new OpenAI({
      baseURL: new URL('./v1', baseURL).href,
      apiKey,
      maxRetries,
    });
    logger.info(`Client initialized with base_url: ${baseURL}`);
  }

  private fetch(
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> {
    if (typeof input === 'string' || input instanceof URL) {
      input = new URL(input, this.baseURL);
    } else {
      input = new URL(input.url, this.baseURL);
    }
    init ??= {};
    const signal = AbortSignal.timeout(this.timeout * 1000);
    init.signal = init.signal ? AbortSignal.any([signal, init.signal]) : signal;
    return fetch(input, init);
  }

  private buildHeaders(apiVersion?: string) {
    const headers: Record<string, string> = {};
    if (apiVersion) {
      headers['x-api-version'] = apiVersion;
    }
    if (this.apiKey) {
      headers['x-api-key'] = this.apiKey;
    }
    return headers;
  }

  private async handleResponseError(response: Response): Promise<never> {
    const data = (await response.json()) as ErrorResponse;
    const cls = Client.getErrorClass(response.status);
    const err = new cls(response, data.error?.message);
    logger.error(err.toString());
    throw err;
  }

  private handleHttpErrors(err: unknown): never {
    if (err instanceof DOMException) {
      if (err.name === 'TimeoutError') {
        const message = `Request timed out after ${this.timeout} seconds`;
        logger.error(message);
        throw new RequestTimeoutError(message, err);
      }
    } else if (err instanceof TypeError) {
      const message = `Network error: ${err}`;
      logger.error(message);
      throw new NetworkError(message, err);
    }
    throw err;
  }

  private static getErrorClass(statusCode: number) {
    if (statusCode >= 500) return ServerError;
    return (
      {
        401: AuthenticationError,
        404: NotFoundError,
        422: ValidationError,
        429: RateLimitError,
      }[statusCode] ?? APIError
    );
  }

  /**
   * Call OpenAI-compatible /v1/chat/completions endpoint.
   *
   * @param model Model to use for inference
   * @param messages Full message history (OpenAI-compatible format)
   * @param temperature Sampling temperature (0.0-2.0)
   * @param taskId Optional task ID for multi-turn conversations
   * @returns Tuple of (Step, raw_output, Usage)
   *   - Step: Parsed actions and reasoning
   *   - raw_output: Raw model output string (for message history)
   *   - Usage: Token usage statistics (or None if not available)
   */
  async chatCompletions(
    model: string,
    messages: ChatCompletionMessageParam[],
    temperature?: number,
    taskId?: string,
  ): Promise<[Step, rawOutput: string, CompletionUsage | undefined]> {
    logger.info(`Making async chat completion request with model: ${model}`);
    const response = await this.client.chat.completions.create({
      model,
      messages,
      temperature,
      // @ts-expect-error extra body
      task_id: taskId,
    });
    const rawOutput = response.choices[0].message.content ?? '';
    const step = {
      ...parseRawOutput(rawOutput),
      usage: response.usage,
    };

    // @ts-expect-error Extract task_id from response (custom field from OAGI API)
    taskId = response.task_id;
    const task = taskId ? `task_id: ${taskId}, ` : '';
    const usage = response.usage
      ? `, tokens: ${response.usage.prompt_tokens}+${response.usage.completion_tokens}`
      : '';
    logger.info(
      `Chat completion successful - ${task}actions: ${step.actions.length}, stop: ${step.stop}${usage}`,
    );

    return [step, rawOutput, response.usage];
  }

  /**
   * Call the /v1/file/upload endpoint to get a S3 presigned URL
   *
   * @param apiVersion API version header
   * @returns {Promise<UploadFileResponse>} The response from /v1/file/upload with uuid and presigned S3 URL
   */
  async getS3PresignedUrl(apiVersion?: string): Promise<UploadFileResponse> {
    logger.debug(`Making async API request to ${API_V1_FILE_UPLOAD_ENDPOINT}`);
    try {
      const headers = this.buildHeaders(apiVersion);
      const response = await this.fetch(API_V1_FILE_UPLOAD_ENDPOINT, {
        headers,
      });
      if (!response.ok) {
        await this.handleResponseError(response);
      }
      try {
        const uploadFileResponse = UploadFileResponseSchema.parse(
          await response.json(),
        );
        logger.debug('Calling /v1/file/upload successful');
        return uploadFileResponse;
      } catch (err) {
        logger.error(`Invalid upload response: ${response.status}`);
        throw new APIError(
          response,
          `Invalid presigned S3 URL response: ${err}`,
        );
      }
    } catch (err) {
      this.handleHttpErrors(err);
    }
  }

  /**
   * Upload image bytes to S3 using presigned URL
   *
   * @param url S3 presigned URL
   * @param content Image bytes to upload
   * @throws {APIError} If upload fails
   */
  async uploadToS3(url: string, content: ArrayBuffer) {
    logger.debug('Uploading image to S3');
    let response: Response | null = null;
    try {
      response = await this.fetch(url, {
        body: content,
        method: 'PUT',
      });
      if (!response.ok) {
        await this.handleResponseError(response);
      }
    } catch (err) {
      logger.error(`S3 upload failed ${err}`);
      if (err instanceof APIError) {
        throw err;
      }
      throw new APIError(
        response ?? new Response(null, { status: 500 }),
        `${err}`,
      );
    }
  }

  /**
   * Get S3 presigned URL and upload image (convenience method)
   *
   * @param screenshot Screenshot image bytes
   * @param apiVersion API version header
   * @returns {UploadFileResponse} The response from /v1/file/upload with uuid and presigned S3 URL
   */
  async putS3PresignedUrl(screenshot: ArrayBuffer, apiVersion?: string) {
    const uploadFileResponse = await this.getS3PresignedUrl(apiVersion);
    await this.uploadToS3(uploadFileResponse.url, screenshot);
    return uploadFileResponse;
  }

  /**
   * Call the /v1/generate endpoint for OAGI worker processing.
   *
   * @returns {Promise<GenerateResponse>} The response from the API
   * @throws {ValueError} If workerId is invalid
   * @throws {APIError} If API returns error
   */
  @logTraceOnFailure
  async callWorker({
    workerId,
    overallTodo,
    taskDescription,
    todos,
    history = [],
    currentTodoIndex,
    taskExecutionSummary,
    currentScreenshot,
    currentSubtaskInstruction,
    windowSteps,
    windowScreenshots,
    resultScreenshot,
    priorNotes,
    latestTodoSummary,
    apiVersion,
  }: GenerateOption): Promise<GenerateResponse> {
    // Validate worker_id
    const validWorkers = ['oagi_first', 'oagi_follow', 'oagi_task_summary'];
    if (!validWorkers.includes(workerId)) {
      throw new ValueError(
        `Invalid worker_id '${workerId}'. Must be one of: ${validWorkers}`,
      );
    }
    logger.info(`Calling /v1/generate with worker_id: ${workerId}`);

    // Build flattened payload (no oagi_data wrapper)
    const payload = {
      external_worker_id: workerId,
      overall_todo: overallTodo,
      task_description: taskDescription,
      todos,
      history,
      // Add optional memory fields
      current_todo_index: currentTodoIndex,
      task_execution_summary: taskExecutionSummary,
      // Add optional screenshot/worker-specific fields
      current_screenshot: currentScreenshot,
      current_subtask_instruction: currentSubtaskInstruction,
      window_steps: windowSteps,
      window_screenshots: windowScreenshots,
      result_screenshot: resultScreenshot,
      prior_notes: priorNotes,
      latest_todo_summary: latestTodoSummary,
    };

    // # Build headers
    const headers = this.buildHeaders(apiVersion);

    // Make request
    try {
      const response = await this.fetch(API_V1_GENERATE_ENDPOINT, {
        body: JSON.stringify(payload),
        headers,
        method: 'POST',
      });
      if (!response.ok) {
        await this.handleResponseError(response);
      }
      const result = GenerateResponseSchema.parse(await response.json());
      // Capture request_id from response header
      result.request_id = response.headers.get('X-Request-ID');
      logger.info(
        `Generate request successful - tokens: ${result.prompt_tokens}+${result.completion_tokens}, request_id: ${result.request_id}`,
      );
      return result;
    } catch (err) {
      this.handleHttpErrors(err);
    }
  }
}
