/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

export class CapsLockManager {
  /**
   * Manages caps lock state for text transformation.
   *
   * This class maintains an internal caps lock state that can be toggled
   * independently of the system's caps lock state. This allows for consistent
   * text case handling during automation regardless of the system state.
   */
  private capsEnabled = false;

  constructor(private mode: string = 'session') {}

  /**
   * Reset caps lock state to default (off).
   *
   * Called at automation start/end and when FINISH action is received.
   */
  reset() {
    this.capsEnabled = false;
  }

  /** Toggle caps lock state in session mode. */
  toggle() {
    if (this.mode === 'session') {
      this.capsEnabled = !this.capsEnabled;
    }
  }

  /**
   * Transform text based on caps lock state.
   *
   * @param text Input text to transform
   * @returns Transformed text (uppercase alphabets if caps enabled in session mode)
   */
  transformText(text: string): string {
    if (this.mode === 'session' && this.capsEnabled) {
      // Transform letters to uppercase, preserve special characters
      return Array.from(text)
        .map((c) => (/[A-Za-z]/.test(c) ? c.toUpperCase() : c))
        .join('');
    }
    return text;
  }

  /** Check if system-level caps lock should be used. */
  shouldUseSystemCapslock(): boolean {
    return this.mode === 'system';
  }
}
