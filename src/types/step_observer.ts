/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import * as z from 'zod';
import { Step } from './models/step.js';
import { Action } from './models/action.js';

export const BaseEventSchema = z.object({
  timestamp: z.date().default(() => new Date()),
});

export type BaseEvent = z.infer<typeof BaseEventSchema>;

export const ImageEventSchema = BaseEventSchema.extend({
  type: z.literal('image'),
  step_num: z.number(),
  image: z.string(),
});

export type ImageEvent = z.infer<typeof ImageEventSchema>;

export const StepEventSchema = BaseEventSchema.extend({
  type: z.literal('step'),
  step_num: z.number(),
  image: z.custom<Buffer>(),
  step: z.custom<Step>(),
  task_id: z.string().optional(),
});

export type StepEvent = z.infer<typeof StepEventSchema>;

export const ActionEventSchema = BaseEventSchema.extend({
  type: z.literal('action'),
  step_num: z.number(),
  actions: z.array(z.custom<Action>()),
  error: z.string().optional(),
});

export type ActionEvent = z.infer<typeof ActionEventSchema>;

export const LogEventSchema = BaseEventSchema.extend({
  type: z.literal('log'),
  message: z.string(),
});

export type LogEvent = z.infer<typeof LogEventSchema>;

export const SplitEventSchema = BaseEventSchema.extend({
  type: z.literal('split'),
  label: z.string().optional(),
});

export type SplitEvent = z.infer<typeof SplitEventSchema>;

export const PlanEventSchema = BaseEventSchema.extend({
  type: z.literal('plan'),
  phase: z.enum(['initial', 'reflection', 'summary']),
  image: z.string().optional(),
  reasoning: z.string(),
  result: z.string().optional(),
  request_id: z.string().optional(),
});

export type PlanEvent = z.infer<typeof PlanEventSchema>;

export type ObserverEvent =
  | ImageEvent
  | StepEvent
  | ActionEvent
  | LogEvent
  | SplitEvent
  | PlanEvent;

export abstract class StepObserver {
  abstract onEvent(event: ObserverEvent): Promise<void>;

  chain(observer?: StepObserver | null): StepObserver {
    return new ChainedStepObserver([this, observer ?? null]);
  }
}

export class ChainedStepObserver extends StepObserver {
  private observers: (StepObserver | null)[];
  constructor(observers: (StepObserver | null)[]) {
    super();
    this.observers = observers;
  }

  async onEvent(event: ObserverEvent): Promise<void> {
    return await this.observers.reduce(async (prev, observer) => {
      await prev;
      if (observer) await observer.onEvent(event);
    }, Promise.resolve());
  }
}
