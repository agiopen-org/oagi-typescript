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
  DEFAULT_TEMPERATURE,
  DEFAULT_TEMPERATURE_LOW,
  MODEL_ACTOR,
  MODEL_THINKER,
} from '../consts.js';
import type { StepObserver } from '../types/index.js';

import { DefaultAgent } from './default.js';
import { TaskerAgent } from './tasker.js';
import { Agent } from './index.js';
import { asyncAgentRegister, type AgentCreateOptions } from './registry.js';

asyncAgentRegister('actor')((options: AgentCreateOptions = {}): Agent => {
  const {
    apiKey,
    baseURL,
    model = MODEL_ACTOR,
    maxSteps = DEFAULT_MAX_STEPS,
    temperature = DEFAULT_TEMPERATURE_LOW,
    stepObserver,
    stepDelay = DEFAULT_STEP_DELAY,
  } = options;

  return new DefaultAgent(
    apiKey,
    baseURL,
    model,
    maxSteps,
    temperature,
    stepObserver ?? undefined,
    stepDelay,
  );
});

asyncAgentRegister('thinker')((options: AgentCreateOptions = {}): Agent => {
  const {
    apiKey,
    baseURL,
    model = MODEL_THINKER,
    maxSteps = DEFAULT_MAX_STEPS_THINKER,
    temperature = DEFAULT_TEMPERATURE_LOW,
    stepObserver,
    stepDelay = DEFAULT_STEP_DELAY,
  } = options;

  return new DefaultAgent(
    apiKey,
    baseURL,
    model,
    maxSteps,
    temperature,
    (stepObserver ?? undefined) as StepObserver | undefined,
    stepDelay,
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

asyncAgentRegister('tasker')((options: AgentCreateOptions = {}): Agent => {
  const {
    apiKey,
    baseURL,
    model = MODEL_ACTOR,
    maxSteps = DEFAULT_MAX_STEPS_TASKER,
    temperature = DEFAULT_TEMPERATURE,
    reflectionInterval = DEFAULT_REFLECTION_INTERVAL_TASKER,
    stepObserver,
    stepDelay = DEFAULT_STEP_DELAY,
  } = options;

  return new TaskerAgent(
    apiKey,
    baseURL,
    model,
    maxSteps,
    temperature,
    reflectionInterval,
    undefined,
    stepObserver ?? undefined,
    stepDelay,
  );
});

asyncAgentRegister('tasker:cvs_appointment')(
  (options: AgentCreateOptions = {}): Agent => {
    const {
      apiKey,
      baseURL,
      model = MODEL_ACTOR,
      maxSteps = DEFAULT_MAX_STEPS_TASKER,
      temperature = DEFAULT_TEMPERATURE,
      reflectionInterval = DEFAULT_REFLECTION_INTERVAL_TASKER,
      stepObserver,
      stepDelay = DEFAULT_STEP_DELAY,
    } = options;

    const tasker = new TaskerAgent(
      apiKey,
      baseURL,
      model,
      maxSteps,
      temperature,
      reflectionInterval,
      undefined,
      stepObserver ?? undefined,
      stepDelay,
    );

    const firstName = 'First';
    const lastName = 'Last';
    const email = 'user@example.com';
    const birthday = '01-01-1990';
    const zipCode = '00000';
    const [month, day, year] = birthday.split('-');

    const instruction =
      `Schedule an appointment at CVS for ${firstName} ${lastName} ` +
      `with email ${email} and birthday ${birthday}`;

    const todos = [
      "Open a new tab, go to www.cvs.com, type 'flu shot' in the search bar and press enter, " +
        'wait for the page to load, then click on the button of Schedule vaccinations on the ' +
        'top of the page',
      `Enter the first name '${firstName}', last name '${lastName}', and email '${email}' ` +
        'in the form. Do not use any suggested autofills. Make sure the mobile phone number ' +
        'is empty.',
      "Slightly scroll down to see the date of birth, enter Month '" +
        month +
        "', Day '" +
        day +
        "', and Year '" +
        year +
        "' in the form",
      "Click on 'Continue as guest' button, wait for the page to load with wait, " +
        "click on 'Add vaccines' button, select 'Flu' and click on 'Add vaccines'",
      "Click on 'next' to enter the page with recommendation vaccines, then click on " +
        "'next' again, until on the page of entering zip code, enter '" +
        zipCode +
        "', select the first option from the dropdown menu, and click on 'Search'",
    ];

    tasker.setTask(instruction, todos);
    return tasker;
  },
);

asyncAgentRegister('tasker:software_qa')(
  (options: AgentCreateOptions = {}): Agent => {
    const {
      apiKey,
      baseURL,
      model = MODEL_ACTOR,
      maxSteps = DEFAULT_MAX_STEPS_TASKER,
      temperature = DEFAULT_TEMPERATURE,
      reflectionInterval = DEFAULT_REFLECTION_INTERVAL_TASKER,
      stepObserver,
      stepDelay = DEFAULT_STEP_DELAY,
    } = options;

    const tasker = new TaskerAgent(
      apiKey,
      baseURL,
      model,
      maxSteps,
      temperature,
      reflectionInterval,
      undefined,
      stepObserver ?? undefined,
      stepDelay,
    );

    const instruction =
      'QA: click through every sidebar button in the Nuclear Player UI';
    const todos = [
      "Click on 'Dashboard' in the left sidebar",
      "Click on 'Downloads' in the left sidebar",
      "Click on 'Lyrics' in the left sidebar",
      "Click on 'Plugins' in the left sidebar",
      "Click on 'Search Results' in the left sidebar",
      "Click on 'Settings' in the left sidebar",
      "Click on 'Equalizer' in the left sidebar",
      "Click on 'Visualizer' in the left sidebar",
      "Click on 'Listening History' in the left sidebar",
      "Click on 'Favorite Albums' in the left sidebar",
      "Click on 'Favorite Tracks' in the left sidebar",
      "Click on 'Favorite Artists' in the left sidebar",
      "Click on 'Local Library' in the left sidebar",
      "Click on 'Playlists' in the left sidebar",
    ];

    tasker.setTask(instruction, todos);
    return tasker;
  },
);
