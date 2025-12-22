/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import pino from 'pino';
import { APIError } from './errors.js';

const levelEnv = process.env.OAGI_LOG?.toLowerCase() ?? 'info';
const allowedLevels = ['debug', 'info', 'warn', 'error', 'fatal'];

const logger = pino({
  level: allowedLevels.includes(levelEnv) ? levelEnv : 'info',
  base: null,
  timestamp: () => `,"time":"${new Date().toISOString()}"`,
  messageKey: 'msg',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: false,
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
      messageFormat: '{msg}',
      ignore: 'pid,hostname',
    },
  },
});

/**
 * Get a logger with the specified name under the 'oagi' namespace.
 *
 * Log level is controlled by OAGI_LOG environment variable.
 * Valid values: DEBUG, INFO, WARNING, ERROR, CRITICAL
 * Default: INFO
 */
const getLogger = (name: string) => logger.child({ name: `oagi.${name}` });
export default getLogger;

export const logTraceOnFailure = (
  _: unknown,
  __: string,
  descriptor: PropertyDescriptor,
) => {
  const original = descriptor.value;
  descriptor.value = async function (...args: unknown[]) {
    try {
      return await original.apply(this, args);
    } catch (err) {
      if (err instanceof APIError) {
        const requestId = err.response.headers.get('x-request-id') ?? '';
        const traceId = err.response.headers.get('x-trace-id') ?? '';

        logger.error(`Request Id: ${requestId}`);
        logger.error(`Trace Id: ${traceId}`);
      }
      throw err;
    }
  };
  return descriptor;
};
