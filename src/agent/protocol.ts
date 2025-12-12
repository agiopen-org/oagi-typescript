/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import type {
  ActionHandler,
  AsyncActionHandler,
  AsyncImageProvider,
  ImageProvider,
} from '../types/index.js';

export interface Agent {
  /**
   * Protocol for synchronous task execution agents.
   */
  execute(
    instruction: string,
    action_handler: ActionHandler,
    image_provider: ImageProvider,
  ): boolean;
}

export interface AsyncAgent {
  /**
   * Protocol for asynchronous task execution agents.
   */
  execute(
    instruction: string,
    action_handler: AsyncActionHandler,
    image_provider: AsyncImageProvider,
  ): Promise<boolean>;
}
