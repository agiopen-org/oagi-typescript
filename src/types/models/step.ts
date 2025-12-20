/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import type { CompletionUsage } from 'openai/resources.js';
import type { Action } from './action';

export interface Step {
  reason?: string;
  actions: Action[];
  stop: boolean;
  usage?: CompletionUsage;
}
