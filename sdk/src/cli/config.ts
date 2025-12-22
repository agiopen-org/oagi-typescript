/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import type { Command } from 'commander';
import { DEFAULT_BASE_URL, MODEL_ACTOR } from '../consts.js';
import { maskApiKey } from './utils.js';

const displayConfig = (): void => {
  const configVars: Record<string, string> = {
    OAGI_API_KEY: process.env.OAGI_API_KEY ?? '',
    OAGI_BASE_URL: process.env.OAGI_BASE_URL ?? DEFAULT_BASE_URL,
    OAGI_DEFAULT_MODEL: process.env.OAGI_DEFAULT_MODEL ?? MODEL_ACTOR,
    OAGI_LOG: process.env.OAGI_LOG ?? 'info',
    OAGI_MAX_STEPS: process.env.OAGI_MAX_STEPS ?? '30',
  };

  process.stdout.write('Current Configuration:\n');
  process.stdout.write('-'.repeat(50) + '\n');

  for (const [key, value] of Object.entries(configVars)) {
    if (key === 'OAGI_API_KEY' && value) {
      process.stdout.write(`${key}: ${maskApiKey(value)}\n`);
    } else {
      const displayValue = value ? value : '(not set)';
      process.stdout.write(`${key}: ${displayValue}\n`);
    }
  }
};

export const addConfigCommand = (program: Command): void => {
  const config = program
    .command('config')
    .description('Configuration management');

  config
    .command('show')
    .description('Display current configuration')
    .action(() => {
      displayConfig();
    });
};
