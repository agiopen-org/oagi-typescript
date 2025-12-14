import { ActionHandler, ImageProvider } from './types/index.js';
import type { Action } from './types/models/action.js';
import {
  parseCoords,
  parseDragCoords,
  parseScroll,
} from './types/models/action.js';
import {
  type ImageConfig,
  ImageConfigSchema,
} from './types/models/image-config.js';
import robot from 'robotjs';
import sharp from 'sharp';

const sleep = (ms: number): Promise<void> =>
  new Promise(r => setTimeout(r, ms));

type SharpResizeKernel =
  | 'nearest'
  | 'cubic'
  | 'mitchell'
  | 'lanczos2'
  | 'lanczos3';

const toSharpKernel = (
  resample: ImageConfig['resample'],
): SharpResizeKernel => {
  switch (resample) {
    case 'NEAREST':
      return 'nearest';
    case 'BICUBIC':
      return 'cubic';
    case 'BILINEAR':
      return 'mitchell';
    case 'LANCZOS':
    default:
      return 'lanczos3';
  }
};

const normalizeKey = (
  raw: string,
  opts: { macosCtrlToCmd: boolean },
): string => {
  const key = raw.trim().toLowerCase();
  if (key === 'caps_lock' || key === 'caps') return 'capslock';
  if (key === 'page_up' || key === 'pageup') return 'pageup';
  if (key === 'page_down' || key === 'pagedown') return 'pagedown';
  if (key === 'cmd') return 'command';
  if (opts.macosCtrlToCmd && process.platform === 'darwin' && key === 'ctrl') {
    return 'command';
  }
  if (key === 'ctrl') return 'control';
  return key;
};

const parseHotkey = (
  arg: string,
  opts: { macosCtrlToCmd: boolean },
): string[] => {
  const s = arg.trim().replace(/^\(/, '').replace(/\)$/, '');
  return s
    .split('+')
    .map(k => normalizeKey(k, opts))
    .filter(Boolean);
};

const stripOuterParens = (s: string): string =>
  s.trim().replace(/^\(/, '').replace(/\)$/, '');

const applySessionCaps = (text: string, enabled: boolean): string => {
  if (!enabled) return text;
  return text
    .split('')
    .map(c => (/[a-z]/i.test(c) ? c.toUpperCase() : c))
    .join('');
};

export type DesktopAutomationConfig = {
  dragDurationMs?: number;
  scrollAmount?: number;
  waitDurationMs?: number;
  hotkeyDelayMs?: number;
  macosCtrlToCmd?: boolean;
  capslockMode?: 'session' | 'system';
};

const defaultDesktopAutomationConfig =
  (): Required<DesktopAutomationConfig> => ({
    dragDurationMs: 500,
    scrollAmount: process.platform === 'darwin' ? 2 : 100,
    waitDurationMs: 1000,
    hotkeyDelayMs: 100,
    macosCtrlToCmd: true,
    capslockMode: 'session',
  });

export class ScreenshotMaker implements ImageProvider {
  #cfg: ImageConfig;
  #last: Buffer | null = null;

  constructor(cfg: Partial<ImageConfig>) {
    const defaultConfig = ImageConfigSchema.parse({});
    this.#cfg = { ...defaultConfig, ...cfg };
  }

  async provide(): Promise<Buffer> {
    return this.capture();
  }

  async capture(): Promise<Buffer> {
    const { width, height } = robot.getScreenSize();
    const screenshot = robot.screen.capture(0, 0, width, height);

    const bytesPerPixel: number = screenshot.bytesPerPixel ?? 4;
    const src: Buffer = screenshot.image;
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0, o = 0; i < src.length; i += bytesPerPixel, o += 4) {
      rgba[o] = src[i + 2] ?? 0;
      rgba[o + 1] = src[i + 1] ?? 0;
      rgba[o + 2] = src[i] ?? 0;
      rgba[o + 3] = 255;
    }

    let p = sharp(rgba, { raw: { width, height, channels: 4 } });

    if (this.#cfg.width || this.#cfg.height) {
      p = p.resize(this.#cfg.width ?? width, this.#cfg.height ?? height, {
        kernel: toSharpKernel(this.#cfg.resample),
      });
    }

    const encoded =
      this.#cfg.format === 'PNG'
        ? await p
            .png({ compressionLevel: this.#cfg.optimize ? 9 : 6 })
            .toBuffer()
        : await p.jpeg({ quality: this.#cfg.quality }).toBuffer();
    this.#last = encoded;
    return this.#last!;
  }

  lastImage(): Buffer | null {
    return this.#last;
  }
}

export class DefaultActionHandler implements ActionHandler {
  readonly #cfg: Required<DesktopAutomationConfig>;
  #sessionCapsEnabled = false;

  constructor(cfg?: DesktopAutomationConfig) {
    this.#cfg = { ...defaultDesktopAutomationConfig(), ...cfg };
  }

  reset(): void {
    this.#sessionCapsEnabled = false;
  }

  async handle(actions: Action[]): Promise<void> {
    for (const action of actions) {
      const count = action.count ?? 1;
      for (let i = 0; i < count; i++) {
        await this.#handleOne(action);
      }
    }
  }

  #denormalize(x: number, y: number): { x: number; y: number } {
    const { width, height } = robot.getScreenSize();

    let px = Math.floor((x * width) / 1000);
    let py = Math.floor((y * height) / 1000);

    if (px < 1) px = 1;
    if (px > width - 1) px = width - 1;
    if (py < 1) py = 1;
    if (py > height - 1) py = height - 1;

    return { x: px, y: py };
  }

  async #handleOne(action: Action): Promise<void> {
    const arg = stripOuterParens(action.argument);

    switch (action.type) {
      case 'click': {
        const coords = parseCoords(arg);
        if (!coords) throw new Error(`Invalid coords: ${arg}`);
        const p = this.#denormalize(coords[0], coords[1]);
        robot.moveMouse(p.x, p.y);
        robot.mouseClick('left', false);
        return;
      }

      case 'left_double': {
        const coords = parseCoords(arg);
        if (!coords) throw new Error(`Invalid coords: ${arg}`);
        const p = this.#denormalize(coords[0], coords[1]);
        robot.moveMouse(p.x, p.y);
        robot.mouseClick('left', true);
        return;
      }

      case 'left_triple': {
        const coords = parseCoords(arg);
        if (!coords) throw new Error(`Invalid coords: ${arg}`);
        const p = this.#denormalize(coords[0], coords[1]);
        robot.moveMouse(p.x, p.y);
        robot.mouseClick('left', true);
        robot.mouseClick('left', false);
        return;
      }

      case 'right_single': {
        const coords = parseCoords(arg);
        if (!coords) throw new Error(`Invalid coords: ${arg}`);
        const p = this.#denormalize(coords[0], coords[1]);
        robot.moveMouse(p.x, p.y);
        robot.mouseClick('right', false);
        return;
      }

      case 'drag': {
        const coords = parseDragCoords(arg);
        if (!coords) throw new Error(`Invalid drag coords: ${arg}`);
        const p1 = this.#denormalize(coords[0], coords[1]);
        const p2 = this.#denormalize(coords[2], coords[3]);
        robot.moveMouse(p1.x, p1.y);
        robot.mouseToggle('down', 'left');
        robot.dragMouse(p2.x, p2.y);
        await sleep(this.#cfg.dragDurationMs);
        robot.mouseToggle('up', 'left');
        return;
      }

      case 'hotkey': {
        const keys = parseHotkey(arg, {
          macosCtrlToCmd: this.#cfg.macosCtrlToCmd,
        });

        if (keys.length === 1 && keys[0] === 'capslock') {
          if (this.#cfg.capslockMode === 'system') {
            robot.keyTap('capslock');
          } else {
            this.#sessionCapsEnabled = !this.#sessionCapsEnabled;
          }
          return;
        }

        const last = keys.at(-1);
        if (!last) return;
        const modifiers = keys.slice(0, -1) as Array<
          'alt' | 'command' | 'control' | 'shift'
        >;

        robot.keyTap(last, modifiers.length ? modifiers : []);
        await sleep(this.#cfg.hotkeyDelayMs);
        return;
      }

      case 'type': {
        const raw = arg.replace(/^['"]/, '').replace(/['"]$/, '');
        const text = applySessionCaps(raw, this.#sessionCapsEnabled);
        robot.typeString(text);
        return;
      }

      case 'scroll': {
        const parsed = parseScroll(arg);
        if (!parsed) throw new Error(`Invalid scroll: ${arg}`);
        const p = this.#denormalize(parsed[0], parsed[1]);
        const direction = parsed[2];
        robot.moveMouse(p.x, p.y);
        const amount =
          direction === 'up' ? this.#cfg.scrollAmount : -this.#cfg.scrollAmount;
        robot.scrollMouse(0, amount);
        return;
      }

      case 'wait': {
        await sleep(this.#cfg.waitDurationMs);
        return;
      }

      case 'finish': {
        this.reset();
        return;
      }

      case 'call_user': {
        return;
      }

      default: {
        const exhaustive: never = action.type;
        throw new Error(`Unknown action type: ${String(exhaustive)}`);
      }
    }
  }
}
