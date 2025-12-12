import type { Action } from './models/action.js';

export type ActionHandler = (actions: Action[]) => void;
