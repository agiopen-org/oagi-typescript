/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import * as z from 'zod';
import { ActionSchema } from './action.js';

export type Content =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'image_url';
      image_url: {
        url: string;
      };
    };

export interface Message {
  role: 'assistant' | 'user';
  content: Content[];
}

export interface Payload {
  model: string;
  messages: Message[];
  task_description?: string;
  task_id?: string;
  temperature?: number;
}

export interface CreateMessageOption {
  /**
   * The model to use for task analysis
   */
  model: string;
  /**
   * Screenshot image bytes (mutually exclusive with screenshot_url)
   */
  screenshot?: ArrayBuffer;
  /**
   * Direct URL to screenshot (mutually exclusive with screenshot)
   */
  screenshotUrl?: string;
  /**
   * Description of the task (required for new sessions)
   */
  taskDescription?: string;
  /**
   * Task ID for continuing existing task
   */
  taskId?: string;
  /**
   * Additional instruction when continuing a session
   */
  instruction?: string;
  /**
   * OpenAI-compatible chat message history
   */
  messagesHistory?: Message[];
  /**
   * Sampling temperature (0.0-2.0) for LLM inference
   */
  temperature?: number;
  /**
   * API version header
   */
  apiVersion?: string;
}

export interface PrepareMessagePayloadOption {
  /**
   * Model to use
   */
  model: string;
  /**
   * Response from S3 upload (if screenshot was uploaded)
   */
  uploadFileResponse?: UploadFileResponse;
  /**
   * Task description
   */
  taskDescription?: string;
  /**
   * Task ID
   */
  taskId?: string;
  /**
   * Optional instruction
   */
  instruction?: string;
  /**
   * Message history
   */
  messagesHistory?: Message[];
  /**
   * Sampling temperature
   */
  temperature?: number;
  /**
   * API version
   */
  apiVersion?: string;
  /**
   * Direct screenshot URL (alternative to upload_file_response)
   */
  screenshotUrl?: string;
}

export interface GenerateOption {
  /**
   * One of "oagi_first", "oagi_follow", "oagi_task_summary"
   */
  workerId: string;
  /**
   * Current todo description
   */
  overallTodo: string;
  /**
   * Overall task description
   */
  taskDescription?: string;
  /**
   * List of todo dicts with index, description, status, execution_summary
   */
  todos: {}[];
  /**
   * List of history dicts with todo_index, todo_description, action_count, summary, completed
   */
  history?: {}[];
  /**
   * Index of current todo being executed
   */
  currentTodoIndex?: number;
  /**
   * Summary of overall task execution
   */
  taskExecutionSummary?: string;
  /**
   * Uploaded file UUID for screenshot (oagi_first)
   */
  currentScreenshot?: string;
  /**
   * Subtask instruction (oagi_follow)
   */
  currentSubtaskInstruction?: string;
  /**
   * Action steps list (oagi_follow)
   */
  windowSteps?: {}[];
  /**
   * Uploaded file UUIDs list (oagi_follow)
   */
  windowScreenshots?: string[];
  /**
   * Uploaded file UUID for result screenshot (oagi_follow)
   */
  resultScreenshot?: string;
  /**
   * Execution notes (oagi_follow)
   */
  priorNotes?: string;
  /**
   * Latest summary (oagi_task_summary)
   */
  latestTodoSummary?: string;
  /**
   * API version header
   */
  apiVersion?: string;
}

export const ErrorDetailSchema = z.object({
  code: z.string(),
  message: z.string(),
});
/**
 * Detailed error information.
 */
export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;

export const ErrorResponseSchema = z.object({
  error: ErrorDetailSchema.nullish(),
});
/**
 * Standard error response format.
 */
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

export const HealthCheckResponseSchema = z.object({
  status: z.string(),
});
export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;

export const UsageSchema = z.object({
  prompt_tokens: z.int(),
  completion_tokens: z.int(),
  total_tokens: z.int(),
});
export type Usage = z.infer<typeof UsageSchema>;

export const LLMResponseSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  object: z.string().default('task.completion'),
  created: z.int(),
  model: z.string(),
  task_description: z.string(),
  is_complete: z.boolean(),
  actions: z.array(ActionSchema),
  reason: z.string().nullish(),
  usage: UsageSchema,
  error: ErrorDetailSchema.nullish(),
  raw_output: z.string().nullish(),
});
export type LLMResponse = z.infer<typeof LLMResponseSchema>;

export const UploadFileResponseSchema = z.object({
  url: z.string(),
  uuid: z.string(),
  expires_at: z.int(),
  file_expires_at: z.int(),
  download_url: z.string(),
});
/**
 * Response from S3 presigned URL upload.
 */
export type UploadFileResponse = z.infer<typeof UploadFileResponseSchema>;

export const GenerateResponseSchema = z.object({
  response: z.string(),
  prompt_tokens: z.int(),
  completion_tokens: z.int(),
  /**
   * @deprecated This field is deprecated
   */
  cost: z.float64().nullish(),
});
/**
 * Response from /v1/generate endpoint.
 */
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;
