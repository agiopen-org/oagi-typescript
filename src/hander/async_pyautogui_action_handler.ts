/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import type { Action } from '../types/models/action.js';
import type { AsyncActionHandler } from '../types/async-action-handler.js';
import { PyautoguiActionHandler, type PyautoguiConfig } from './pyautogui_action_handler.js';

export class AsyncPyautoguiActionHandler {
  /**
   * Async wrapper for PyautoguiActionHandler that runs actions in a thread pool.
   *
   * This allows PyAutoGUI operations to be non-blocking in async contexts,
   * enabling concurrent execution of other async tasks while GUI actions are performed.
   */

  private syncHandler: PyautoguiActionHandler;
  private config: PyautoguiConfig;

  constructor(config?: PyautoguiConfig) {
    /**
     * Initialize with optional configuration.
     *
     * Args:
     *     config: PyautoguiConfig instance for customizing behavior
     */
    this.syncHandler = new PyautoguiActionHandler(config);
    this.config = config ?? this.syncHandler.config;
  }

  /**
   * Reset handler state.
   *
   * Delegates to the underlying synchronous handler's reset method.
   * Called at automation start/end and when FINISH action is received.
   */
  reset() {
    this.syncHandler.reset();
  }

  /**
   * Execute actions asynchronously.
   *
   * This prevents PyAutoGUI operations from blocking the async event loop,
   * allowing other coroutines to run while GUI actions are being performed.
   *
   * Args:
   *     actions: List of actions to execute
   */
  async call(actions: Action[]): Promise<void> {
    await Promise.resolve(this.syncHandler.call(actions));
  }

  asHandler(): AsyncActionHandler {
    const handler = (async (actions: Action[]) => this.call(actions)) as AsyncActionHandler & {
      reset?: () => void;
    };
    handler.reset = () => this.reset();
    void this.config;
    return handler;
  }
}
