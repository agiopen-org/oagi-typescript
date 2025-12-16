/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import { Action } from './models/action.js';

export * from './models/index.js';
export * from './step_observer.js';

export interface ActionHandler {
  handle(actions: Action[]): Promise<void>;
}

export interface ImageProvider {
  provide(): Promise<ArrayBuffer>;
}
