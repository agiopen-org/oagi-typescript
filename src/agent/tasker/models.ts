/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

export enum TodoStatus {
  /** Status of a todo item in the workflow. */
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
}

export type Todo = {
  /** A single todo item in the workflow. */
  description: string;
  status: TodoStatus;
};

export type TaskerAction = {
  /** An action taken during execution. */
  timestamp: string;
  action_type: string;
  target?: string | null;
  details: Record<string, unknown>;
  reasoning?: string | null;
  result?: string | null;
  screenshot_uuid?: string | null;
};

export type TodoHistory = {
  /** Execution history for a specific todo. */
  todo_index: number;
  todo: string;
  actions: TaskerAction[];
  summary?: string | null;
  completed: boolean;
};

export type PlannerOutput = {
  /** Output from the LLM planner's initial planning. */
  instruction: string;
  reasoning: string;
  subtodos: string[];
};

export type ReflectionOutput = {
  /** Output from the LLM planner's reflection. */
  continue_current: boolean;
  new_instruction?: string | null;
  reasoning: string;
  success_assessment: boolean;
};

export type ExecutionResult = {
  /** Result from executing a single todo. */
  success: boolean;
  actions: TaskerAction[];
  summary: string;
  error?: string | null;
  total_steps: number;
};
