/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

// Import factories to trigger registration
import { ActionHandler, ImageProvider } from '../types/index.js';
import './factories.js';

export { DefaultAgent } from './default.js';
export { TaskerAgent } from './tasker.js';

export {
  asyncAgentRegister,
  createAgent,
  getAgentFactory,
  listAgentModes,
} from './registry.js';

export * from './observer/index.js';

export interface Agent {
  /**
   * Protocol for synchronous task execution agents.
   */
  execute(
    instruction: string,
    action_handler: ActionHandler,
    image_provider: ImageProvider,
  ): Promise<boolean>;
}
