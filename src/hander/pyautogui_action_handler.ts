/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import os from 'node:os';

import type { Action, ActionType } from '../types/models/action.js';
import { parseCoords, parseDragCoords, parseScroll } from '../types/models/action.js';
import { CapsLockManager } from './capslock_manager.js';
import * as macos from './_macos.js';
import * as windows from './_windows.js';
import robot from 'robotjs';

export class PyautoguiConfig {
  /** Configuration for PyautoguiActionHandler. */

  drag_duration: number = 0.5;
  scroll_amount: number = os.platform() === 'darwin' ? 2 : 100;
  wait_duration: number = 1.0;
  action_pause: number = 0.1;
  hotkey_interval: number = 0.1;
  capslock_mode: string = 'session';
  macos_ctrl_to_cmd: boolean = true;

  constructor(init?: Partial<PyautoguiConfig>) {
    Object.assign(this, init);
  }
}

export class PyautoguiActionHandler {
  /**
   * Handles actions to be executed using PyAutoGUI.
   *
   * This class provides functionality for handling and executing a sequence of
   * actions using the PyAutoGUI library. It processes a list of actions and executes
   * them as per the implementation.
   *
   * Methods:
   *     call: Executes the provided list of actions.
   *
   * Args:
   *     actions (Action[]): List of actions to be processed and executed.
   */

  public config: PyautoguiConfig;

  private screenWidth = 0;
  private screenHeight = 0;
  private capsManager: CapsLockManager;

  constructor(config?: PyautoguiConfig) {
    // Use default config if none provided
    this.config = config ?? new PyautoguiConfig();
    // Get screen dimensions for coordinate denormalization
    const screen = robot.getScreenSize();
    this.screenWidth = screen.width;
    this.screenHeight = screen.height;
    // Set default delay between actions
    // Initialize caps lock manager
    this.capsManager = new CapsLockManager(this.config.capslock_mode);
  }

  private sleepSync(seconds: number) {
    if (seconds <= 0) {
      return;
    }
    const ms = Math.floor(seconds * 1000);
    const sab = new SharedArrayBuffer(4);
    const int32 = new Int32Array(sab);
    Atomics.wait(int32, 0, 0, ms);
  }

  /**
   * Reset handler state.
   *
   * Called at automation start/end and when FINISH action is received.
   * Resets the internal capslock state.
   */
  reset() {
    this.capsManager.reset();
  }

  /**
   * Convert coordinates from 0-1000 range to actual screen coordinates.
   *
   * Also handles corner coordinates to prevent PyAutoGUI fail-safe trigger.
   * Corner coordinates (0,0), (0,max), (max,0), (max,max) are offset by 1 pixel.
   */
  private denormalizeCoords(x: number, y: number): [number, number] {
    const screenX = Math.floor((x * this.screenWidth) / 1000);
    const screenY = Math.floor((y * this.screenHeight) / 1000);

    let fixedX = screenX;
    let fixedY = screenY;

    if (fixedX < 1) {
      fixedX = 1;
    } else if (fixedX > this.screenWidth - 1) {
      fixedX = this.screenWidth - 1;
    }

    if (fixedY < 1) {
      fixedY = 1;
    } else if (fixedY > this.screenHeight - 1) {
      fixedY = this.screenHeight - 1;
    }

    return [fixedX, fixedY];
  }

  /** Extract x, y coordinates from argument string. */
  private parseCoords(argsStr: string): [number, number] {
    const coords = parseCoords(argsStr);
    if (!coords) {
      throw new Error(`Invalid coordinates format: ${argsStr}`);
    }
    return this.denormalizeCoords(coords[0], coords[1]);
  }

  /** Extract x1, y1, x2, y2 coordinates from drag argument string. */
  private parseDragCoords(argsStr: string): [number, number, number, number] {
    const coords = parseDragCoords(argsStr);
    if (!coords) {
      throw new Error(`Invalid drag coordinates format: ${argsStr}`);
    }
    const [x1, y1] = this.denormalizeCoords(coords[0], coords[1]);
    const [x2, y2] = this.denormalizeCoords(coords[2], coords[3]);
    return [x1, y1, x2, y2];
  }

  /** Extract x, y, direction from scroll argument string. */
  private parseScroll(argsStr: string): [number, number, string] {
    const result = parseScroll(argsStr);
    if (!result) {
      throw new Error(`Invalid scroll format: ${argsStr}`);
    }
    const [x, y] = this.denormalizeCoords(result[0], result[1]);
    return [x, y, result[2]];
  }

  /** Normalize key names for consistency. */
  private normalizeKey(key: string): string {
    let k = key.trim().toLowerCase();

    // Normalize caps lock variations
    const hotkeyVariationsMapping: Record<string, string[]> = {
      capslock: ['caps_lock', 'caps', 'capslock'],
      pgup: ['page_up', 'pageup'],
      pgdn: ['page_down', 'pagedown'],
    };

    for (const [normalized, variations] of Object.entries(hotkeyVariationsMapping)) {
      if (variations.includes(k)) {
        return normalized;
      }
    }

    // Remap ctrl to command on macOS if enabled
    if (this.config.macos_ctrl_to_cmd && os.platform() === 'darwin' && k === 'ctrl') {
      k = 'command';
    }

    return k;
  }

  /** Parse hotkey string into list of keys. */
  private parseHotkey(argsStr: string): string[] {
    // Remove parentheses if present
    const stripped = argsStr.replace(/^\(|\)$/g, '');
    // Split by '+' to get individual keys
    return stripped.split('+').map((key) => this.normalizeKey(key));
  }

  /** Execute a single action once. */
  private executeSingleAction(action: Action): void {
    const arg = action.argument.replace(/^\(|\)$/g, '');

    switch (action.type as ActionType) {
      case 'click': {
        const [x, y] = this.parseCoords(arg);
        robot.moveMouse(x, y);
        robot.mouseClick('left', false);
        this.sleepSync(this.config.action_pause);
        return;
      }

      case 'left_double': {
        const [x, y] = this.parseCoords(arg);
        if (os.platform() === 'darwin') {
          macos.macosClick(x, y, 2);
        } else {
          robot.moveMouse(x, y);
          robot.mouseClick('left', true);
        }
        this.sleepSync(this.config.action_pause);
        return;
      }

      case 'left_triple': {
        const [x, y] = this.parseCoords(arg);
        if (os.platform() === 'darwin') {
          macos.macosClick(x, y, 3);
        } else {
          robot.moveMouse(x, y);
          robot.mouseClick('left', true);
          this.sleepSync(0.02);
          robot.mouseClick('left', false);
        }
        this.sleepSync(this.config.action_pause);
        return;
      }

      case 'right_single': {
        const [x, y] = this.parseCoords(arg);
        robot.moveMouse(x, y);
        robot.mouseClick('right', false);
        this.sleepSync(this.config.action_pause);
        return;
      }

      case 'drag': {
        const [x1, y1, x2, y2] = this.parseDragCoords(arg);
        robot.moveMouse(x1, y1);
        robot.mouseToggle('down', 'left');

        // Approximate smooth drag.
        const steps = Math.max(1, Math.floor(this.config.drag_duration * 60));
        for (let i = 1; i <= steps; i++) {
          const x = Math.round(x1 + ((x2 - x1) * i) / steps);
          const y = Math.round(y1 + ((y2 - y1) * i) / steps);
          robot.dragMouse(x, y);
          this.sleepSync(this.config.drag_duration / steps);
        }

        robot.mouseToggle('up', 'left');
        this.sleepSync(this.config.action_pause);
        return;
      }

      case 'hotkey': {
        const keys = this.parseHotkey(arg);

        if (keys.length === 1 && keys[0] === 'capslock') {
          if (this.capsManager.shouldUseSystemCapslock()) {
            robot.keyTap('capslock');
          } else {
            this.capsManager.toggle();
          }
        } else {
          const modifiers = keys.slice(0, -1);
          const mainKey = keys[keys.length - 1] ?? '';
          robot.keyTap(mainKey, modifiers as any);
        }

        this.sleepSync(this.config.action_pause);
        return;
      }

      case 'type': {
        // Remove quotes if present
        let text = arg.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
        // Apply caps lock transformation if needed
        text = this.capsManager.transformText(text);

        if (os.platform() === 'darwin') {
          macos.typewriteExact(text, 0.01);
        } else if (os.platform() === 'win32') {
          windows.typewriteExact(text, 0.01);
        } else {
          robot.typeString(text);
        }

        this.sleepSync(this.config.action_pause);
        return;
      }

      case 'scroll': {
        const [x, y, direction] = this.parseScroll(arg);
        robot.moveMouse(x, y);
        const amount = direction === 'up' ? this.config.scroll_amount : -this.config.scroll_amount;
        robot.scrollMouse(0, amount);
        this.sleepSync(this.config.action_pause);
        return;
      }

      case 'finish': {
        // Task completion - reset handler state
        this.reset();
        return;
      }

      case 'wait': {
        // Wait for a short period
        this.sleepSync(this.config.wait_duration);
        return;
      }

      case 'call_user': {
        // Call user - implementation depends on requirements
        // eslint-disable-next-line no-console
        console.log('User intervention requested');
        return;
      }

      default: {
        // eslint-disable-next-line no-console
        console.log(`Unknown action type: ${String(action.type)}`);
        return;
      }
    }
  }

  /** Execute an action, potentially multiple times. */
  private executeAction(action: Action): void {
    const count = action.count ?? 1;
    for (let i = 0; i < count; i++) {
      this.executeSingleAction(action);
    }
  }

  /** Execute the provided list of actions. */
  call(actions: Action[]): void {
    for (const action of actions) {
      try {
        this.executeAction(action);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.log(`Error executing action ${String(action.type)}: ${String(e)}`);
        throw e;
      }
    }
  }
}
