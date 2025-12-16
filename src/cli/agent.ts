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
import { AsyncAgentObserver } from '../agent/observer/agent_observer.js';
import { createAgent, listAgentModes } from '../agent/index.js';
import {
  API_KEY_HELP_URL,
  DEFAULT_BASE_URL,
  DEFAULT_MAX_STEPS_THINKER,
  DEFAULT_STEP_DELAY,
  MODE_ACTOR,
  MODEL_THINKER,
} from '../consts.js';
import { DefaultActionHandler, ScreenshotMaker } from '../handler.js';
import getLogger from '../logger.js';
import { displayStepTable } from './display.js';
import { StepTracker } from './tracking.js';
import macPerm from '@hurdlegroup/node-mac-permissions';
import { AgentCreateOptions } from '../agent/registry.js';

const logger = getLogger('cli.agent');

const checkPermissions = async (): Promise<void> => {
  if (process.platform !== 'darwin') {
    process.stdout.write(
      'Warning: Permission check is only applicable on macOS.\n',
    );
    process.stdout.write(
      'On other platforms, no special permissions are required.\n',
    );
    return;
  }

  const screenPermission = macPerm.getAuthStatus('screen');
  const accessibilityPermission = macPerm.getAuthStatus('accessibility');

  console.log('Checking permissions...');
  console.log(`  ${screenPermission ? '[OK]' : '[MISSING]'} Screen Recording`);
  console.log(
    `  ${accessibilityPermission ? '[OK]' : '[MISSING]'} Accessibility`,
  );

  if (!screenPermission) {
    macPerm.askForScreenCaptureAccess(true);
  }
  if (!accessibilityPermission) {
    macPerm.askForAccessibilityAccess();
  }

  if (screenPermission && accessibilityPermission) {
    console.log('All permissions granted. You can run the agent.');
  } else {
    console.log('After granting, run this command again to continue.');
    console.log(
      'Note: You may need to restart your terminal after granting permissions.',
    );
    process.exitCode = 1;
    return;
  }
};

type AgentRunOptions = {
  model?: string;
  maxSteps?: number;
  temperature?: number;
  mode: string;
  oagiApiKey?: string;
  oagiBaseUrl?: string;
  export?: 'markdown' | 'html' | 'json';
  exportFile?: string;
  stepDelay?: number;
};

const runAgent = async (
  instruction: string,
  opts: AgentRunOptions,
): Promise<void> => {
  const apiKey = opts.oagiApiKey ?? process.env.OAGI_API_KEY;
  if (!apiKey) {
    process.stderr.write(
      'Error: OAGI API key not provided.\n' +
        'Set OAGI_API_KEY environment variable or use --oagi-api-key flag.\n' +
        `Get your API key at ${API_KEY_HELP_URL}\n`,
    );
    process.exitCode = 1;
    return;
  }

  const baseUrl =
    opts.oagiBaseUrl ?? process.env.OAGI_BASE_URL ?? DEFAULT_BASE_URL;
  const mode = opts.mode ?? MODE_ACTOR;
  const stepDelay = opts.stepDelay ?? DEFAULT_STEP_DELAY;

  const exportFormat = opts.export;
  const exportFile = opts.exportFile;

  const stepTracker = new StepTracker();
  const agentObserver = exportFormat ? new AsyncAgentObserver() : null;

  const createOpts: AgentCreateOptions = {
    apiKey,
    baseUrl,
    stepObserver: stepTracker.chain(agentObserver),
    stepDelay,
  };

  if (opts.model) {
    createOpts.model = opts.model;
    if (opts.model === MODEL_THINKER && !opts.maxSteps) {
      createOpts.maxSteps = DEFAULT_MAX_STEPS_THINKER;
    }
  }
  if (typeof opts.maxSteps === 'number') {
    createOpts.maxSteps = opts.maxSteps;
  }
  if (typeof opts.temperature === 'number') {
    createOpts.temperature = opts.temperature;
  }

  const agent = createAgent(mode, createOpts);

  let actionHandler: DefaultActionHandler;
  let imageProvider: ScreenshotMaker;
  try {
    actionHandler = new DefaultActionHandler();
    imageProvider = new ScreenshotMaker();
  } catch (e) {
    process.stderr.write(
      `Error: desktop automation dependencies failed to load: ${String(e)}\n` +
        "If you're using pnpm and robotjs is installed, you may need to run: pnpm approve-builds\n",
    );
    process.exitCode = 1;
    return;
  }

  if (instruction) {
    process.stdout.write(`Starting agent with instruction: ${instruction}\n`);
  } else {
    process.stdout.write(
      `Starting agent with mode: ${mode} (using pre-configured instruction)\n`,
    );
  }
  process.stdout.write(`Mode: ${mode}\n`);
  process.stdout.write('-'.repeat(60) + '\n');

  const start = Date.now();
  let success = false;
  let interrupted = false;

  const onSigint = () => {
    interrupted = true;
    process.stdout.write('\nAgent execution interrupted by user (Ctrl+C)\n');
  };

  process.once('SIGINT', onSigint);

  try {
    if (interrupted) throw new Error('Interrupted');
    success = await agent.execute(instruction, actionHandler, imageProvider);
  } catch (err) {
    if (interrupted) {
      process.exitCode = 130;
    } else {
      logger.error(`Error during agent execution: ${String(err)}`);
      process.exitCode = 1;
    }
  } finally {
    process.off('SIGINT', onSigint);
    const durationSeconds = (Date.now() - start) / 1000;

    if (stepTracker.steps.length) {
      process.stdout.write('\n' + '='.repeat(60) + '\n');
      displayStepTable(stepTracker.steps, success, durationSeconds);
    } else {
      process.stdout.write('\nNo steps were executed.\n');
    }

    if (exportFormat && agentObserver) {
      const extMap: Record<string, string> = {
        markdown: 'md',
        html: 'html',
        json: 'json',
      };

      const outputPath =
        exportFile ?? `execution_report.${extMap[exportFormat]}`;
      try {
        agentObserver.export(exportFormat, outputPath);
        process.stdout.write(
          `\nExecution history exported to: ${outputPath}\n`,
        );
      } catch (e) {
        process.stderr.write(
          `\nError exporting execution history: ${String(e)}\n`,
        );
      }
    }

    if (interrupted) {
      process.exitCode = 130;
    } else if (!success && !process.exitCode) {
      process.exitCode = 1;
    }
  }
};

export const addAgentCommand = (program: Command): void => {
  const agent = program
    .command('agent')
    .description('Agent execution commands');

  agent
    .command('run')
    .description('Run an agent with the given instruction')
    .argument('[instruction]', 'Task instruction for the agent to execute')
    .option('--model <model>', 'Model to use (default: determined by mode)')
    .option(
      '--max-steps <number>',
      'Maximum number of steps (default: determined by mode)',
      (v: string) => Number(v),
    )
    .option(
      '--temperature <number>',
      'Sampling temperature (default: determined by mode)',
      (v: string) => Number(v),
    )
    .option(
      '--mode <mode>',
      `Agent mode to use (default: ${MODE_ACTOR})`,
      MODE_ACTOR,
    )
    .option(
      '--oagi-api-key <key>',
      'OAGI API key (default: OAGI_API_KEY env var)',
    )
    .option(
      '--oagi-base-url <url>',
      `OAGI base URL (default: ${DEFAULT_BASE_URL}, or OAGI_BASE_URL env var)`,
    )
    .option(
      '--export <format>',
      'Export execution history to file (markdown, html, or json)',
    )
    .option(
      '--export-file <path>',
      'Output file path for export (default: execution_report.[md|html|json])',
    )
    .option(
      '--step-delay <number>',
      `Delay in seconds after each step before next screenshot (default: ${DEFAULT_STEP_DELAY})`,
      (v: string) => Number(v),
    )
    .action(async (instruction: string | undefined, options: any) => {
      await runAgent(instruction ?? '', {
        model: options.model,
        maxSteps: options.maxSteps,
        temperature: options.temperature,
        mode: options.mode,
        oagiApiKey: options.oagiApiKey,
        oagiBaseUrl: options.oagiBaseUrl,
        export: options.export,
        exportFile: options.exportFile,
        stepDelay: options.stepDelay,
      });
    });

  agent
    .command('modes')
    .description('List available agent modes')
    .action(() => {
      const modes = listAgentModes();
      process.stdout.write('Available agent modes:\n');
      for (const m of modes) process.stdout.write(`  - ${m}\n`);
    });

  agent
    .command('permission')
    .description(
      'Check macOS permissions for screen recording and accessibility',
    )
    .action(async () => {
      await checkPermissions();
    });
};
