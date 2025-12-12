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
import type { Step } from './step';

/**
 * A single todo item in the task workflow.
 */
export interface Todo {
  /**
   * Todo index in the list
   */
  index: number;
  /**
   * Todo description
   */
  description: string;
  /**
   * Current status of the todo
   */
  status: 'pending' | 'in_progress' | 'completed' | 'blocked';
  /**
   * Summary of execution for this todo
   */
  execution_summary?: string;
}

export interface HistoryItem {
  /**
   * Index of the todo that was executed
   */
  todo_index: number;
  /**
   * Description of the todo
   */
  todo_description: string;
  /**
   * Number of actions taken
   */
  action_count: number;
  /**
   * Execution summary
   */
  summary?: string;
  /**
   * Whether the todo was completed
   */
  completed: boolean;
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
  todos: Todo[];
  /**
   * List of history dicts with todo_index, todo_description, action_count, summary, completed
   */
  history?: HistoryItem[];
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
  windowSteps?: Step[];
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
  request_id: z.string().nullish(),
});
/**
 * Response from /v1/generate endpoint.
 */
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>;
