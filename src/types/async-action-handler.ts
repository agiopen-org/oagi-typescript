import type { Action } from './models/action.js';

export type AsyncActionHandler = (actions: Action[]) => Promise<void>;
