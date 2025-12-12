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
  DEFAULT_MAX_STEPS,
  DEFAULT_MAX_STEPS_TASKER,
  DEFAULT_MAX_STEPS_THINKER,
  DEFAULT_REFLECTION_INTERVAL_TASKER,
  DEFAULT_STEP_DELAY,
  DEFAULT_TEMPERATURE_LOW,
  MODEL_ACTOR,
  MODEL_THINKER,
} from '../consts.js';
import type { AsyncStepObserver } from '../types/index.js';

import { AsyncDefaultAgent } from './default.js';
import type { AsyncAgent } from './protocol.js';
import { asyncAgentRegister } from './registry.js';

asyncAgentRegister('actor')((kwargs: Record<string, unknown> = {}): AsyncAgent => {
  const {
    api_key,
    base_url,
    model = MODEL_ACTOR,
    max_steps = DEFAULT_MAX_STEPS,
    temperature = DEFAULT_TEMPERATURE_LOW,
    step_observer,
    step_delay = DEFAULT_STEP_DELAY,
  } = kwargs as {
    api_key?: string;
    base_url?: string;
    model?: string;
    max_steps?: number;
    temperature?: number;
    step_observer?: AsyncStepObserver;
    step_delay?: number;
  };

  return new AsyncDefaultAgent(
    api_key,
    base_url,
    model,
    max_steps,
    temperature,
    step_observer,
    step_delay,
  );
});

asyncAgentRegister('thinker')((kwargs: Record<string, unknown> = {}): AsyncAgent => {
  const {
    api_key,
    base_url,
    model = MODEL_THINKER,
    max_steps = DEFAULT_MAX_STEPS_THINKER,
    temperature = DEFAULT_TEMPERATURE_LOW,
    step_observer,
    step_delay = DEFAULT_STEP_DELAY,
  } = kwargs as {
    api_key?: string;
    base_url?: string;
    model?: string;
    max_steps?: number;
    temperature?: number;
    step_observer?: AsyncStepObserver;
    step_delay?: number;
  };

  return new AsyncDefaultAgent(
    api_key,
    base_url,
    model,
    max_steps,
    temperature,
    step_observer,
    step_delay,
  );
});

// NOTE: TaskerAgent factories are defined in the python SDK.
// They will be ported to TypeScript in `src/agent/tasker`.
// Constants are imported here to keep parity with python.
export const _taskerFactoryDefaults = {
  model: MODEL_ACTOR,
  max_steps: DEFAULT_MAX_STEPS_TASKER,
  temperature: DEFAULT_TEMPERATURE_LOW,
  reflection_interval: DEFAULT_REFLECTION_INTERVAL_TASKER,
  step_delay: DEFAULT_STEP_DELAY,
};
