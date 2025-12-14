/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type {
  Action,
  ActionEvent,
  ActionType,
  ImageEvent,
  LogEvent,
  ObserverEvent,
  PlanEvent,
  SplitEvent,
  StepEvent,
} from '../../types/index.js';
import {
  parseCoords,
  parseDragCoords,
  parseScroll,
} from '../../types/models/action.js';

const ensureDir = (dirPath: string) => {
  fs.mkdirSync(dirPath, { recursive: true });
};

type ParsedActionCoords =
  | { type: 'click'; x: number; y: number }
  | { type: 'drag'; x1: number; y1: number; x2: number; y2: number }
  | { type: 'scroll'; x: number; y: number; direction: string };

const parseActionCoords = (action: Action): ParsedActionCoords | null => {
  /**
   * Parse coordinates from action argument for cursor indicators.
   */
  const arg = action.argument.replace(/^\(|\)$/g, '');

  switch (action.type as ActionType) {
    case 'click':
    case 'left_double':
    case 'left_triple':
    case 'right_single': {
      const coords = parseCoords(arg);
      if (coords) {
        return { type: 'click', x: coords[0], y: coords[1] };
      }
      return null;
    }

    case 'drag': {
      const coords = parseDragCoords(arg);
      if (coords) {
        return {
          type: 'drag',
          x1: coords[0],
          y1: coords[1],
          x2: coords[2],
          y2: coords[3],
        };
      }
      return null;
    }

    case 'scroll': {
      const result = parseScroll(arg);
      if (result) {
        return {
          type: 'scroll',
          x: result[0],
          y: result[1],
          direction: result[2],
        };
      }
      return null;
    }

    default:
      return null;
  }
};

export const exportToMarkdown = (
  events: ObserverEvent[],
  filePath: string,
  imagesDir?: string | null,
) => {
  /**
   * Export events to a Markdown file.
   */
  const outputDir = path.dirname(filePath);
  ensureDir(outputDir);

  if (imagesDir) {
    ensureDir(imagesDir);
  }

  const lines: string[] = ['# Agent Execution Report\n'];

  for (const event of events) {
    const d =
      event.timestamp instanceof Date
        ? event.timestamp
        : new Date(event.timestamp);
    const timestamp = d.toTimeString().slice(0, 8);

    switch (event.type) {
      case 'step': {
        const e = event as StepEvent;
        lines.push(`\n## Step ${e.step_num}\n`);
        lines.push(`**Time:** ${timestamp}\n`);
        if (e.task_id) {
          lines.push(`**Task ID:** \`${e.task_id}\`\n`);
        }

        if (typeof e.image !== 'string') {
          if (imagesDir) {
            const imageFilename = `step_${e.step_num}.png`;
            const imagePath = path.join(imagesDir, imageFilename);
            fs.writeFileSync(imagePath, Buffer.from(e.image));
            const relPath = path.join(path.basename(imagesDir), imageFilename);
            lines.push(`\n![Step ${e.step_num}](${relPath})\n`);
          } else {
            lines.push(
              `\n*[Screenshot captured - ${e.image.byteLength} bytes]*\n`,
            );
          }
        } else {
          lines.push(`\n**Screenshot URL:** ${e.image}\n`);
        }

        if (e.step.reason) {
          lines.push(`\n**Reasoning:**\n> ${e.step.reason}\n`);
        }

        if (e.step.actions?.length) {
          lines.push('\n**Planned Actions:**\n');
          for (const action of e.step.actions) {
            const countStr =
              action.count && action.count > 1 ? ` (x${action.count})` : '';
            lines.push(`- \`${action.type}\`: ${action.argument}${countStr}\n`);
          }
        }

        if (e.step.stop) {
          lines.push('\n**Status:** Task Complete\n');
        }
        break;
      }

      case 'action': {
        const e = event as ActionEvent;
        lines.push(`\n### Actions Executed (${timestamp})\n`);
        if (e.error) {
          lines.push(`\n**Error:** ${e.error}\n`);
        } else {
          lines.push('\n**Result:** Success\n');
        }
        break;
      }

      case 'log': {
        const e = event as LogEvent;
        lines.push(`\n> **Log (${timestamp}):** ${e.message}\n`);
        break;
      }

      case 'split': {
        const e = event as SplitEvent;
        if (e.label) {
          lines.push(`\n---\n\n### ${e.label}\n`);
        } else {
          lines.push('\n---\n');
        }
        break;
      }

      case 'image': {
        const _e = event as ImageEvent;
        void _e;
        break;
      }

      case 'plan': {
        const e = event as PlanEvent;
        const phaseTitles: Record<string, string> = {
          initial: 'Initial Planning',
          reflection: 'Reflection',
          summary: 'Summary',
        };
        const phaseTitle = phaseTitles[e.phase] ?? e.phase;

        lines.push(`\n### ${phaseTitle} (${timestamp})\n`);
        if (e.request_id) {
          lines.push(`**Request ID:** \`${e.request_id}\`\n`);
        }

        if (e.image) {
          if (typeof e.image !== 'string') {
            if (imagesDir) {
              const imageFilename = `plan_${e.phase}_${Date.now()}.png`;
              const imagePath = path.join(imagesDir, imageFilename);
              fs.writeFileSync(imagePath, Buffer.from(e.image));
              const relPath = path.join(
                path.basename(imagesDir),
                imageFilename,
              );
              lines.push(`\n![${phaseTitle}](${relPath})\n`);
            } else {
              lines.push(
                `\n*[Screenshot captured - ${e.image.byteLength} bytes]*\n`,
              );
            }
          } else {
            lines.push(`\n**Screenshot URL:** ${e.image}\n`);
          }
        }

        if (e.reasoning) {
          lines.push(`\n**Reasoning:**\n> ${e.reasoning}\n`);
        }

        if (e.result) {
          lines.push(`\n**Result:** ${e.result}\n`);
        }
        break;
      }
    }
  }

  fs.writeFileSync(filePath, lines.join(''), 'utf-8');
};

type HtmlStepEvent = {
  event_type: 'step';
  timestamp: string;
  step_num: number;
  image: string | null;
  action_coords: ParsedActionCoords[];
  reason?: string;
  actions: { type: string; argument: string; count: number }[];
  stop: boolean;
  task_id?: string | null;
};

type HtmlActionEvent = {
  event_type: 'action';
  timestamp: string;
  error?: string | null;
};

type HtmlLogEvent = {
  event_type: 'log';
  timestamp: string;
  message: string;
};

type HtmlSplitEvent = {
  event_type: 'split';
  timestamp: string;
  label: string;
};

type HtmlPlanEvent = {
  event_type: 'plan';
  timestamp: string;
  phase: string;
  image: string | null;
  reasoning: string;
  result?: string | null;
  request_id?: string | null;
};

type HtmlEvent =
  | HtmlStepEvent
  | HtmlActionEvent
  | HtmlLogEvent
  | HtmlSplitEvent
  | HtmlPlanEvent;

const convertEventsForHtml = (events: ObserverEvent[]): HtmlEvent[] => {
  /** Convert events to JSON-serializable format for HTML template. */
  const result: HtmlEvent[] = [];

  for (const event of events) {
    const d =
      event.timestamp instanceof Date
        ? event.timestamp
        : new Date(event.timestamp);
    const timestamp = d.toTimeString().slice(0, 8);

    switch (event.type) {
      case 'step': {
        const e = event as StepEvent;

        const action_coords: ParsedActionCoords[] = [];
        const actions: { type: string; argument: string; count: number }[] = [];

        if (e.step.actions?.length) {
          for (const action of e.step.actions) {
            const coords = parseActionCoords(action);
            if (coords) {
              action_coords.push(coords);
            }
            actions.push({
              type: action.type,
              argument: action.argument,
              count: action.count ?? 1,
            });
          }
        }

        let image: string | null = null;
        if (typeof e.image !== 'string') {
          image = Buffer.from(e.image).toString('base64');
        } else {
          image = e.image;
        }

        result.push({
          event_type: 'step',
          timestamp,
          step_num: e.step_num,
          image,
          action_coords,
          reason: e.step.reason,
          actions,
          stop: e.step.stop,
          task_id: e.task_id,
        });
        break;
      }

      case 'action': {
        const e = event as ActionEvent;
        result.push({
          event_type: 'action',
          timestamp,
          error: e.error ?? null,
        });
        break;
      }

      case 'log': {
        const e = event as LogEvent;
        result.push({ event_type: 'log', timestamp, message: e.message });
        break;
      }

      case 'split': {
        const e = event as SplitEvent;
        result.push({ event_type: 'split', timestamp, label: e.label });
        break;
      }

      case 'image': {
        const _e = event as ImageEvent;
        void _e;
        break;
      }

      case 'plan': {
        const e = event as PlanEvent;

        let image: string | null = null;
        if (e.image) {
          if (typeof e.image !== 'string') {
            image = Buffer.from(e.image).toString('base64');
          } else {
            image = e.image;
          }
        }

        result.push({
          event_type: 'plan',
          timestamp,
          phase: e.phase,
          image,
          reasoning: e.reasoning,
          result: e.result ?? null,
          request_id: e.request_id ?? null,
        });
        break;
      }
    }
  }

  return result;
};

export const exportToHtml = (events: ObserverEvent[], filePath: string) => {
  /**
   * Export events to a self-contained HTML file.
   */
  const outputDir = path.dirname(filePath);
  ensureDir(outputDir);

  const moduleUrl = (import.meta as any)?.url
    ? (import.meta as any).url
    : pathToFileURL(__filename).href;
  const moduleDir = path.dirname(fileURLToPath(moduleUrl));
  const templatePath = path.join(moduleDir, 'report_template.html');
  const template = fs.readFileSync(templatePath, 'utf-8');

  const eventsData = convertEventsForHtml(events);
  const eventsJson = JSON.stringify(eventsData);

  const htmlContent = template.replace('{EVENTS_DATA}', eventsJson);
  fs.writeFileSync(filePath, htmlContent, 'utf-8');
};

export const exportToJson = (events: ObserverEvent[], filePath: string) => {
  /**
   * Export events to a JSON file.
   */
  const outputDir = path.dirname(filePath);
  ensureDir(outputDir);

  const jsonEvents = events.map(event => {
    // Handle ArrayBuffer images before JSON to avoid binary output
    if (
      (event.type === 'step' ||
        event.type === 'image' ||
        event.type === 'plan') &&
      (event as any).image &&
      typeof (event as any).image !== 'string'
    ) {
      const base: any = {
        ...event,
        timestamp:
          event.timestamp instanceof Date
            ? event.timestamp.toISOString()
            : new Date(event.timestamp).toISOString(),
      };
      base.image = Buffer.from((event as any).image as ArrayBuffer).toString(
        'base64',
      );
      base.image_encoding = 'base64';
      return base;
    }

    return {
      ...event,
      timestamp:
        event.timestamp instanceof Date
          ? event.timestamp.toISOString()
          : new Date(event.timestamp).toISOString(),
    };
  });

  fs.writeFileSync(filePath, JSON.stringify(jsonEvents, null, 2), 'utf-8');
};
