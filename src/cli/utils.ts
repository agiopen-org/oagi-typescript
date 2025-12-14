/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

export const setupLogging = (verbose: boolean): void => {
  if (verbose) {
    process.env.OAGI_LOG = 'debug';
  }
};

export const maskApiKey = (value: string): string => {
  if (!value) return '';
  return value.length > 8 ? `${value.slice(0, 8)}...` : '***';
};
