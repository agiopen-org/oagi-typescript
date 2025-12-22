/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

// URLs & API Endpoints
export const DEFAULT_BASE_URL = 'https://api.agiopen.org';
export const API_KEY_HELP_URL = 'https://developer.agiopen.org/api-keys';
export const API_V1_FILE_UPLOAD_ENDPOINT = '/v1/file/upload';
export const API_V1_GENERATE_ENDPOINT = '/v1/generate';

// Model identifiers
export const MODEL_ACTOR = 'lux-actor-1';
export const MODEL_THINKER = 'lux-thinker-1';

// Agent modes
export const MODE_ACTOR = 'actor';
export const MODE_THINKER = 'thinker';
export const MODE_TASKER = 'tasker';

// Default max steps per model
export const DEFAULT_MAX_STEPS = 20;
export const DEFAULT_MAX_STEPS_THINKER = 100;
export const DEFAULT_MAX_STEPS_TASKER = 60;

// Maximum allowed steps per model (hard limits)
export const MAX_STEPS_ACTOR = 30;
export const MAX_STEPS_THINKER = 120;

// Reflection intervals
export const DEFAULT_REFLECTION_INTERVAL = 4;
export const DEFAULT_REFLECTION_INTERVAL_TASKER = 20;

// Timing & Delays
export const DEFAULT_STEP_DELAY = 0.3;

// Temperature Defaults
export const DEFAULT_TEMPERATURE = 0.5;
export const DEFAULT_TEMPERATURE_LOW = 0.1;

// Timeout Values
export const HTTP_CLIENT_TIMEOUT = 60;

// Retry Configuration
export const DEFAULT_MAX_RETRIES = 2;
