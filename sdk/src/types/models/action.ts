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

export const ActionTypeSchema = z.enum([
  'click',
  'left_double',
  'left_triple',
  'right_single',
  'drag',
  'hotkey',
  'type',
  'scroll',
  'finish',
  'wait',
  'call_user',
]);
export type ActionType = z.infer<typeof ActionTypeSchema>;

export const ActionSchema = z.object({
  /**
   * Type of action to perform
   */
  type: ActionTypeSchema,
  /**
   * Action argument in the specified format
   */
  argument: z.string(),
  /**
   * Number of times to repeat the action
   */
  count: z.int().default(1),
});
export type Action = z.infer<typeof ActionSchema>;

/**
 * Extract x, y coordinates from argument string.
 *
 * @param args Argument string in format "x, y" (normalized 0-1000 range)
 * @returns Tuple of (x, y) coordinates, or None if parsing fails
 */
export const parseCoords = (args: string): [number, number] | null => {
  const match = /(\d+),\s*(\d+)/.exec(args);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2])];
};

/**
 * Extract x1, y1, x2, y2 coordinates from drag argument string.
 * @param args Argument string in format "x1, y1, x2, y2" (normalized 0-1000 range)
 * @returns Tuple of (x1, y1, x2, y2) coordinates, or None if parsing fails
 */
export const parseDragCoords = (
  args: string,
): [number, number, number, number] | null => {
  const match = /(\d+),\s*(\d+),\s*(\d+),\s*(\d+)/.exec(args);
  if (!match) {
    return null;
  }
  return [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
  ];
};

/**
 * Extract x, y, direction from scroll argument string.
 * @param args Argument string in format "x, y, direction" (normalized 0-1000 range)
 * @returns Tuple of (x, y, direction) where direction is "up" or "down", or None if parsing fails
 */
export const parseScroll = (args: string): [number, number, string] | null => {
  const match = /(\d+),\s*(\d+),\s*(\w+)/.exec(args);
  if (!match) {
    return null;
  }
  return [Number(match[1]), Number(match[2]), match[3].toLowerCase()];
};
