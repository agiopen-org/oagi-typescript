/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import type { LogEvent, ObserverEvent, SplitEvent } from '../../types/index.js';
import { exportToHtml, exportToJson, exportToMarkdown } from './exporters';

export enum ExportFormat {
  /** Supported export formats. */
  MARKDOWN = 'markdown',
  HTML = 'html',
  JSON = 'json',
}

export class AsyncAgentObserver {
  /**
   * Records agent execution events and exports to various formats.
   *
   * This class implements the AsyncObserver protocol and provides
   * functionality for recording events during agent execution and
   * exporting them to Markdown or HTML formats.
   */

  events: ObserverEvent[] = [];

  async on_event(event: ObserverEvent): Promise<void> {
    /**
     * Record an event.
     *
     * @param event The event to record.
     */
    this.events.push(event);
  }

  add_log(message: string): void {
    /**
     * Add a custom log message.
     *
     * @param message The log message to add.
     */
    const event: LogEvent = {
      type: 'log',
      timestamp: new Date(),
      message,
    };
    this.events.push(event);
  }

  add_split(label: string = ''): void {
    /**
     * Add a visual separator.
     *
     * @param label Optional label for the separator.
     */
    const event: SplitEvent = {
      type: 'split',
      timestamp: new Date(),
      label,
    };
    this.events.push(event);
  }

  clear(): void {
    /** Clear all recorded events. */
    this.events = [];
  }

  get_events_by_step(step_num: number): ObserverEvent[] {
    /**
     * Get all events for a specific step.
     *
     * @param step_num The step number to filter by.
     */
    return this.events.filter(
      (event) => (event as any).step_num !== undefined && (event as any).step_num === step_num,
    );
  }

  export(format: ExportFormat | string, path: string, images_dir?: string | null): void {
    /**
     * Export recorded events to a file.
     *
     * @param format Export format (markdown, html, json)
     * @param path Path to the output file.
     * @param images_dir Directory to save images (markdown only).
     */
    const normalized =
      typeof format === 'string'
        ? (format.toLowerCase() as ExportFormat)
        : format;

    switch (normalized) {
      case ExportFormat.MARKDOWN:
        exportToMarkdown(this.events, path, images_dir ?? undefined);
        return;
      case ExportFormat.HTML:
        exportToHtml(this.events, path);
        return;
      case ExportFormat.JSON:
        exportToJson(this.events, path);
        return;
      default:
        throw new Error(`Unknown export format: ${String(format)}`);
    }
  }
}
