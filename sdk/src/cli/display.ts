/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import Table from 'cli-table3';
import type { StepData } from './tracking.js';

export const displayStepTable = (
  steps: StepData[],
  success: boolean,
  durationSeconds?: number,
): void => {
  const table = new Table({
    head: ['Step', 'Reasoning', 'Actions', 'Status'],
    colWidths: [6, 60, 40, 10],
    wordWrap: true,
  });

  for (const step of steps) {
    const reason = step.reasoning ?? 'N/A';

    const actionsDisplay: string[] = [];
    for (const action of step.actions.slice(0, 3)) {
      const arg = action.argument ? String(action.argument).slice(0, 20) : '';
      const countStr =
        action.count && action.count > 1 ? ` x${action.count}` : '';
      actionsDisplay.push(`${action.type}(${arg})${countStr}`);
    }

    let actionsStr = actionsDisplay.join(', ');
    if (step.actions.length > 3) {
      actionsStr += ` (+${step.actions.length - 3} more)`;
    }

    const statusDisplay = step.status === 'completed' ? 'ok' : step.status;

    table.push([String(step.step_num), reason, actionsStr, statusDisplay]);
  }

  process.stdout.write(String(table) + '\n');

  const statusText = success ? 'Success' : 'Failed/Interrupted';
  process.stdout.write(
    `\nTotal Steps: ${steps.length} | Status: ${statusText}\n`,
  );

  if (typeof durationSeconds === 'number') {
    process.stdout.write(`Duration: ${durationSeconds.toFixed(2)}s\n`);
  }
};
