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
import type { AsyncObserver } from '../types/index.js';

import { AsyncDefaultAgent } from './default.js';
import type { AsyncAgent } from './protocol.js';
import { asyncAgentRegister, type AgentCreateOptions } from './registry.js';

asyncAgentRegister('actor')((options: AgentCreateOptions = {}): AsyncAgent => {
  const {
    apiKey,
    baseUrl,
    model = MODEL_ACTOR,
    maxSteps = DEFAULT_MAX_STEPS,
    temperature = DEFAULT_TEMPERATURE_LOW,
    stepObserver,
    stepDelay = DEFAULT_STEP_DELAY,
  } = options;

  return new AsyncDefaultAgent(
    apiKey,
    baseUrl,
    model,
    maxSteps,
    temperature,
    (stepObserver ?? undefined) as AsyncObserver | undefined,
    stepDelay,
  );
});

asyncAgentRegister('thinker')(
  (options: AgentCreateOptions = {}): AsyncAgent => {
    const {
      apiKey,
      baseUrl,
      model = MODEL_THINKER,
      maxSteps = DEFAULT_MAX_STEPS_THINKER,
      temperature = DEFAULT_TEMPERATURE_LOW,
      stepObserver,
      stepDelay = DEFAULT_STEP_DELAY,
    } = options;

    return new AsyncDefaultAgent(
      apiKey,
      baseUrl,
      model,
      maxSteps,
      temperature,
      (stepObserver ?? undefined) as AsyncObserver | undefined,
      stepDelay,
    );
  },
);

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
