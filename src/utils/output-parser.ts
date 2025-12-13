/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import { ActionTypeSchema } from '../types/index.js';
import type { Action, Step } from '../types';

/**
 * Split action block by & separator, but only when & is outside parentheses.
 *
 * Note: This parser does NOT handle '&' inside quoted strings.
 * E.g., type("a&b") would incorrectly split. The LLM should avoid
 * this pattern by using alternative escape sequences.
 *
 * @param actionBlock String containing one or more actions separated by &
 * @returns List of individual action strings
 */
const splitActions = (actionBlock: string): string[] => {
  const actions: string[] = [];
  let currentAction: string[] = [];
  let parenLevel = 0;

  for (const char of actionBlock) {
    currentAction.push(char);
    switch (char) {
      case '(':
        parenLevel++;
        break;
      case ')':
        parenLevel--;
        break;
      case '&':
        if (parenLevel === 0) {
          const action = currentAction.join('').trim();
          action && actions.push(action);
          currentAction = [];
        }
        break;
    }
  }
  const lastAction = currentAction.join('').trim();
  lastAction && actions.push(lastAction);
  return actions;
};

/**
 * Parse individual action text into Action object.
 *
 * Expected formats:
 * - click(x, y) # left-click at position
 * - left_double(x, y) # left-double-click at position
 * - left_triple(x, y) # left-triple-click at position
 * - right_single(x, y) # right-click at position
 * - drag(x1, y1, x2, y2) # drag from (x1, y1) to (x2, y2)
 * - hotkey(key, c) # press key c times
 * - type(text) # type text string
 * - scroll(x, y, direction, c) # scroll at position
 * - wait() # wait for a while
 * - finish() # indicate task is finished
 *
 * @param action String representation of a single action
 * @returns Action object or None if parsing fails
 */
const parseAction = (action: string): Action | null => {
  const match = /(\w+)\((.*)\)/.exec(action);
  if (!match) return null;

  const { data: actionType, success } = ActionTypeSchema.safeParse(match[1]);
  if (!success) return null;

  let argument = match[2].trim();
  const args = argument.split(',');
  let count = 1;
  // Parse specific action types and extract count where applicable
  switch (actionType) {
    // hotkey(key, c) - press key c times
    case 'hotkey':
      if (args.length >= 2 && args[1].trim()) {
        argument = args[0].trim();
        count = Number(args[1].trim());
      }
      break;
    case 'scroll':
      // scroll(x, y, direction, c) - scroll at position
      if (args.length >= 4) {
        const x = args[0].trim();
        const y = args[1].trim();
        const direction = args[2].trim();
        argument = `${x},${y},${direction}`;
        count = Number(args[3].trim());
      }
      break;
    default:
    // For other actions, use default count of 1
  }
  if (!Number.isInteger(count) || count <= 0) {
    count = 1;
  }
  return { type: actionType, argument, count };
};

/**
 * Parse raw LLM output into structured Step format.
 *
 * Expected format:
 * <|think_start|> reasoning text <|think_end|>
 * <|action_start|> action1(args) & action2(args) & ... <|action_end|>
 *
 * @param rawOutput Raw text output from the LLM
 * @returns Step object with parsed reasoning and actions
 */
export const parseRawOutput = (rawOutput: string): Step => {
  const reason =
    /<\|think_start\|>(.*?)<\|think_end\|>/s.exec(rawOutput)?.[1] ?? '';
  const action =
    /<\|action_start\|>(.*?)<\|action_end\|>/s.exec(rawOutput)?.[1] ?? '';

  const actions = splitActions(action)
    .map(parseAction)
    .filter((action): action is Action => !!action);
  return {
    reason,
    actions,
    stop: actions.some(action => action.type === 'finish'),
  };
};
