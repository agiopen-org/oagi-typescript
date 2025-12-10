/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import {
  API_HEALTH_ENDPOINT,
  API_KEY_HELP_URL,
  API_V1_FILE_UPLOAD_ENDPOINT,
  API_V1_GENERATE_ENDPOINT,
  API_V2_MESSAGE_ENDPOINT,
  DEFAULT_BASE_URL,
  HTTP_CLIENT_TIMEOUT,
} from './consts.js';
import {
  APIError,
  AuthenticationError,
  ConfigurationError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  RequestError,
  RequestTimeoutError,
  ServerError,
  ValidationError,
  ValueError,
} from './errors.js';
import getLogger, { logTraceOnFailure } from './logger.js';
import {
  GenerateResponseSchema,
  LLMResponseSchema,
  UploadFileResponseSchema,
} from './types/index.js';
import type {
  Content,
  CreateMessageOption,
  ErrorResponse,
  GenerateOption,
  GenerateResponse,
  HealthCheckResponse,
  LLMResponse,
  Message,
  Payload,
  PrepareMessagePayloadOption,
  UploadFileResponse,
} from './types';

const logger = getLogger('client');

/**
 * HTTP client for the OAGI API.
 */
export default class Client {
  private timeout = HTTP_CLIENT_TIMEOUT;

  constructor(
    private baseUrl: string = process.env.OAGI_BASE_URL ?? DEFAULT_BASE_URL,
    private apiKey: string | null = process.env.OAGI_API_KEY ?? null,
  ) {
    if (!apiKey) {
      throw new ConfigurationError(
        `OAGI API key must be provided either as 'api_key' parameter or OAGI_API_KEY environment variable. Get your API key at ${API_KEY_HELP_URL}`,
      );
    }
    logger.info(`Client initialized with base_url: ${baseUrl}`);
  }

  private fetch(
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> {
    if (typeof input === 'string' || input instanceof URL) {
      input = new URL(input, this.baseUrl);
    } else {
      input = new URL(input.url, this.baseUrl);
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

  /**
   * Build OpenAI-compatible request payload.
   *
   * @param model Model to use
   * @param messageHistory OpenAI-compatible message history
   * @param taskDescription Task description
   * @param taskId Task ID for continuing session
   * @param temperature Sampling temperature
   * @returns {Payload} OpenAI-compatible request payload
   */
  private buildPayload(
    model: string,
    messageHistory: Message[],
    taskDescription?: string,
    taskId?: string,
    temperature?: number,
  ): Payload {
    return {
      model,
      messages: messageHistory,
      task_description: taskDescription,
      task_id: taskId,
      temperature,
    };
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

  private logRequestInfo(
    model: string,
    taskDescription?: string,
    taskId?: string,
  ) {
    logger.info(`Making API request to /v2/message with model: ${model}`);
    logger.debug(
      `Request includes task_description: ${!!taskDescription}, task_id: ${!!taskId}`,
    );
  }

  /**
   * Build OpenAI-compatible user message with screenshot and optional instruction.
   *
   * @param screenshotUrl URL of uploaded screenshot
   * @param instruction Optional text instruction
   * @returns User message
   */
  private buildUserMessage(
    screenshotUrl: string,
    instruction?: string,
  ): Message {
    const content: Content[] = [
      {
        type: 'image_url',
        image_url: {
          url: screenshotUrl,
        },
      },
    ];
    if (instruction) {
      content.push({
        type: 'text',
        text: instruction,
      });
    }

    return {
      role: 'user',
      content,
    };
  }

  /**
   * Prepare headers and payload for /v2/message request.
   *
   * @returns Tuple of (headers, payload)
   */
  private prepareMessagePayload({
    model,
    uploadFileResponse,
    taskDescription,
    taskId,
    instruction,
    messagesHistory,
    temperature,
    apiVersion,
    screenshotUrl,
  }: PrepareMessagePayloadOption): [Record<string, string>, Payload] {
    // Use provided screenshot_url or get from upload_file_response
    if (!screenshotUrl) {
      if (!uploadFileResponse) {
        throw new ValueError(
          'Either screenshot_url or upload_file_response must be provided',
        );
      }
      screenshotUrl = uploadFileResponse.download_url;
    }

    // Build user message and append to history
    messagesHistory ??= [];
    messagesHistory.push(this.buildUserMessage(screenshotUrl, instruction));

    // Build payload and headers
    const headers = this.buildHeaders(apiVersion);
    const payload = this.buildPayload(
      model,
      messagesHistory,
      taskDescription,
      taskId,
      temperature,
    );

    return [headers, payload];
  }

  /**
   * Call the /v2/message endpoint to analyze task and screenshot
   *
   * @returns {Promise<LLMResponse>} The response from the API
   * @throws {ValueError} If both or neither screenshot and screenshot_url are provided
   */
  @logTraceOnFailure
  async createMessage({
    model,
    screenshot,
    screenshotUrl,
    taskDescription,
    taskId,
    instruction,
    messagesHistory,
    temperature,
    apiVersion,
  }: CreateMessageOption): Promise<LLMResponse> {
    // Validate that exactly one is provided
    if (!screenshot === !screenshotUrl) {
      throw new ValueError(
        "Exactly one of 'screenshot' or 'screenshot_url' must be provided",
      );
    }

    this.logRequestInfo(model, taskDescription, taskId);

    // Upload screenshot to S3 if bytes provided, otherwise use URL directly
    let uploadFileResponse: UploadFileResponse | undefined;
    if (screenshot) {
      uploadFileResponse = await this.putS3PresignedUrl(screenshot, apiVersion);
    }

    // Prepare message payload
    const [headers, payload] = this.prepareMessagePayload({
      model,
      uploadFileResponse,
      taskDescription,
      taskId,
      instruction,
      messagesHistory,
      temperature,
      apiVersion,
      screenshotUrl,
    });

    // Make request
    try {
      const response = await this.fetch(API_V2_MESSAGE_ENDPOINT, {
        body: JSON.stringify(payload),
        headers,
        method: 'POST',
      });
      if (!response.ok) {
        await this.handleResponseError(response);
      }
      const result = LLMResponseSchema.parse(await response.json());
      if (result.error) {
        logger.error(
          `API Error in response: [${result.error.code}]: ${result.error.message}`,
        );
        throw new APIError(response, result.error.message);
      }
      logger.info(
        `API request successful - task_id: ${result.task_id}, complete: ${result.is_complete}`,
      );
      logger.debug(`Response included ${result.actions.length} actions`);
      return result;
    } catch (err) {
      this.handleHttpErrors(err);
    }
  }

  /**
   * Call the /health endpoint for health check
   *
   * @returns {HealthCheckResponse} Health check response
   */
  async healthCheck(): Promise<HealthCheckResponse> {
    logger.debug('Making async health check request');
    try {
      const response = await this.fetch(API_HEALTH_ENDPOINT);
      if (!response.ok) {
        throw new RequestError(response);
      }
      const result = await response.json();
      logger.debug('Async health check successful');
      return result;
    } catch (err) {
      logger.warn(`Health check failed: ${err}`);
      throw err;
    }
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
      logger.info(
        `Generate request successful - tokens: ${result.prompt_tokens}+${result.completion_tokens}, `,
      );
      return result;
    } catch (err) {
      this.handleHttpErrors(err);
    }
  }
}
