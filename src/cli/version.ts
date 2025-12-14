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
import { createRequire } from 'module';

const getSdkVersion = (): string => {
  try {
    const require = createRequire(import.meta.url);

    // In dist, files may live under dist/*, so try both
    for (const p of ['../package.json', '../../package.json']) {
      try {
        const pkg = require(p) as { version?: string };
        if (pkg.version && pkg.version !== '0.0.0') return pkg.version;
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  return 'unknown';
};

const displayVersion = (): void => {
  const sdkVersion = getSdkVersion();

  process.stdout.write(`OAGI SDK version: ${sdkVersion}\n`);
  process.stdout.write(`Node version: ${process.version}\n`);
  process.stdout.write(`Platform: ${process.platform}\n`);
};

export const addVersionCommand = (program: Command): void => {
  program
    .command('version')
    .description('Show SDK version and environment info')
    .action(() => {
      displayVersion();
    });
};
