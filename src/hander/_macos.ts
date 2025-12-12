/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

/**
 * macOS-specific keyboard and mouse input handling.
 *
 * This module provides:
 * - macosClick(): Fix for PyAutoGUI multi-click bug on macOS
 * - typewriteExact(): Type text exactly, ignoring system capslock state
 */

import robot from 'robotjs';

const sleepSync = (seconds: number) => {
  if (seconds <= 0) {
    return;
  }
  const ms = Math.floor(seconds * 1000);
  const sab = new SharedArrayBuffer(4);
  const int32 = new Int32Array(sab);
  Atomics.wait(int32, 0, 0, ms);
};

const SHIFT_KEY_MAP: Record<string, string> = {
  '~': '`',
  '!': '1',
  '@': '2',
  '#': '3',
  $: '4',
  '%': '5',
  '^': '6',
  '&': '7',
  '*': '8',
  '(': '9',
  ')': '0',
  _: '-',
  '+': '=',
  '{': '[',
  '}': ']',
  '|': '\\',
  ':': ';',
  '"': "'",
  '<': ',',
  '>': '.',
  '?': '/',
};

const needsShift = (char: string) =>
  /[A-Z]/.test(char) || Object.prototype.hasOwnProperty.call(SHIFT_KEY_MAP, char);

const baseKey = (char: string) => {
  if (/[A-Z]/.test(char)) {
    return char.toLowerCase();
  }
  if (Object.prototype.hasOwnProperty.call(SHIFT_KEY_MAP, char)) {
    return SHIFT_KEY_MAP[char] as string;
  }
  return char;
};

export const typewriteExact = (text: string, interval: number = 0.01): void => {
  for (const char of Array.from(text)) {
    const shift = needsShift(char);
    const key = baseKey(char);

    if (key === '\n') {
      robot.keyTap('enter');
    } else if (key === '\t') {
      robot.keyTap('tab');
    } else if (key === ' ') {
      robot.keyTap('space');
    } else if (key.length === 1) {
      if (shift) {
        robot.keyTap(key, 'shift');
      } else {
        robot.keyTap(key);
      }
    }

    sleepSync(interval);
  }
};

export const macosClick = (x: number, y: number, clicks: number = 1): void => {
  // Move to position first to ensure consistency
  robot.moveMouse(x, y);

  if (clicks <= 1) {
    robot.mouseClick('left', false);
    return;
  }

  if (clicks === 2) {
    robot.mouseClick('left', true);
    return;
  }

  // robotjs doesn't provide a triple-click primitive; send a click sequence.
  for (let i = 0; i < clicks; i++) {
    robot.mouseClick('left', false);
    sleepSync(0.02);
  }
};
