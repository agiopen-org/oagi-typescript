import type { Action } from './models/action.js';
import type { Step } from './models/step.js';

type BaseEvent = {
  timestamp: Date;
};

export type ImageEvent = BaseEvent & {
  type: 'image';
  step_num: number;
  image: ArrayBuffer | string;
};

export type StepEvent = BaseEvent & {
  type: 'step';
  step_num: number;
  image: ArrayBuffer | string;
  step: Step;
  task_id?: string | null;
};

export type ActionEvent = BaseEvent & {
  type: 'action';
  step_num: number;
  actions: Action[];
  error?: string | null;
};

export type LogEvent = BaseEvent & {
  type: 'log';
  message: string;
};

export type SplitEvent = BaseEvent & {
  type: 'split';
  label: string;
};

export type PlanEvent = BaseEvent & {
  type: 'plan';
  phase: 'initial' | 'reflection' | 'summary';
  image?: ArrayBuffer | string | null;
  reasoning: string;
  result?: string | null;
  request_id?: string | null;
};

export type ObserverEvent =
  | ImageEvent
  | StepEvent
  | ActionEvent
  | LogEvent
  | SplitEvent
  | PlanEvent;

export interface AsyncObserver {
  on_event(event: ObserverEvent): Promise<void>;
}

export type AsyncStepObserver = AsyncObserver;

export type { BaseEvent };
