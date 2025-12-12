/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import type { TaskerAction, Todo, TodoHistory, TodoStatus } from './models.js';

export class PlannerMemory {
  /**
   * In-memory state management for the planner agent.
   *
   * This class manages the hierarchical task execution state for TaskerAgent.
   * It provides methods for:
   * - Task/todo management
   * - Execution history tracking
   * - Memory state serialization
   *
   * Context formatting for backend API calls is handled by the backend.
   */

  task_description: string = '';
  todos: Todo[] = [];
  history: TodoHistory[] = [];
  task_execution_summary: string = '';
  todo_execution_summaries: Record<number, string> = {};

  /** Initialize empty memory. */
  constructor() {}

  set_task(task_description: string, todos: Array<string | Todo>): void {
    /**
     * Set the task and todos.
     */
    this.task_description = task_description;

    // Convert todos
    this.todos = [];
    for (const todo of todos) {
      if (typeof todo === 'string') {
        this.todos.push({ description: todo, status: 'pending' as any });
      } else {
        this.todos.push(todo);
      }
    }
  }

  get_current_todo(): [Todo | null, number] {
    /**
     * Get the next pending or in-progress todo.
     */
    for (let idx = 0; idx < this.todos.length; idx++) {
      const todo = this.todos[idx]!;
      if (todo.status === 'pending' || todo.status === 'in_progress') {
        return [todo, idx];
      }
    }
    return [null, -1];
  }

  update_todo(index: number, status: TodoStatus | string, summary?: string | null): void {
    /**
     * Update a todo's status and optionally its summary.
     */
    if (index >= 0 && index < this.todos.length) {
      const normalized = (typeof status === 'string' ? status : status) as TodoStatus;
      this.todos[index]!.status = normalized;
      if (summary) {
        this.todo_execution_summaries[index] = summary;
      }
    }
  }

  add_history(
    todo_index: number,
    actions: TaskerAction[],
    summary?: string | null,
    completed: boolean = false,
  ): void {
    /**
     * Add execution history for a todo.
     */
    if (todo_index >= 0 && todo_index < this.todos.length) {
      this.history.push({
        todo_index,
        todo: this.todos[todo_index]!.description,
        actions,
        summary,
        completed,
      });
    }
  }

  get_context(): Record<string, unknown> {
    /**
     * Get the full context for planning/reflection.
     */
    return {
      task_description: this.task_description,
      todos: this.todos.map((t, i) => ({
        index: i,
        description: t.description,
        status: t.status,
      })),
      history: this.history.map((h) => ({
        todo_index: h.todo_index,
        todo: h.todo,
        action_count: h.actions.length,
        summary: h.summary,
        completed: h.completed,
      })),
      task_execution_summary: this.task_execution_summary,
      todo_execution_summaries: this.todo_execution_summaries,
    };
  }

  get_todo_status_summary(): Record<string, number> {
    /**
     * Get a summary of todo statuses.
     */
    const summary: Record<string, number> = {
      pending: 0,
      in_progress: 0,
      completed: 0,
      skipped: 0,
    };

    for (const todo of this.todos) {
      summary[todo.status] = (summary[todo.status] ?? 0) + 1;
    }

    return summary;
  }

  append_todo(description: string): void {
    /**
     * Append a new todo to the list.
     */
    this.todos.push({ description, status: 'pending' as any });
  }
}
