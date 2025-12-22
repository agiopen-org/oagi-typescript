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
  StepObserver,
  type Action,
  type ActionEvent,
  type ObserverEvent,
  type StepEvent,
} from '../types/index.js';

export type StepData = {
  step_num: number;
  timestamp: Date;
  reasoning: string | null;
  actions: Action[];
  action_count: number;
  status: string;
};

export class StepTracker extends StepObserver {
  /** Tracks agent step execution by implementing AsyncObserver protocol. */

  steps: StepData[] = [];

  async onEvent(event: ObserverEvent): Promise<void> {
    switch (event.type) {
      case 'step': {
        const e = event as StepEvent;
        this.steps.push({
          step_num: e.step_num,
          timestamp: e.timestamp,
          reasoning: e.step.reason ?? null,
          actions: e.step.actions,
          action_count: e.step.actions.length,
          status: 'running',
        });
        return;
      }
      case 'action': {
        const e = event as ActionEvent;
        for (const step of this.steps) {
          if (step.step_num === e.step_num) {
            step.status = e.error ? 'error' : 'completed';
            break;
          }
        }
        return;
      }
      default:
        return;
    }
  }
}
