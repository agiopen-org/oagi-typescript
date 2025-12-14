/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import { Command } from 'commander';
import { addAgentCommand } from './agent.js';
import { addConfigCommand } from './config.js';
import { addVersionCommand } from './version.js';
import { setupLogging } from './utils.js';

export const createProgram = (): Command => {
  const program = new Command();

  program
    .name('oagi')
    .description('OAGI SDK Command Line Interface')
    .option('-v, --verbose', 'Enable verbose (debug) logging');

  addAgentCommand(program);
  addVersionCommand(program);
  addConfigCommand(program);

  return program;
};

export const main = async (argv: string[] = process.argv): Promise<void> => {
  const program = createProgram();

  try {
    program.hook('preAction', (thisCommand: any) => {
      const opts = thisCommand.opts();
      setupLogging(Boolean(opts?.verbose));
    });

    await program.parseAsync(argv);
  } catch (err) {
    if (err instanceof Error && err.name === 'CommanderError') {
      process.exitCode = 1;
      return;
    }

    if (err instanceof Error && err.message === 'Interrupted') {
      process.exitCode = 130;
      return;
    }

    process.stderr.write(`Unexpected error: ${String(err)}\n`);
    process.exitCode = 1;
  }
};
