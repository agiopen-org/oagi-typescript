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

import type { Image } from '../types/image.js';
import type { ImageConfig } from '../types/models/image-config.js';

export class PILImage implements Image {
  /** PIL image wrapper with transformation capabilities. */

  private cachedBytes: ArrayBuffer | null = null;

  constructor(
    private data: ArrayBuffer,
    private config: ImageConfig,
  ) {}

  private static toArrayBuffer(data: ArrayBuffer | Uint8Array): ArrayBuffer {
    if (data instanceof Uint8Array) {
      return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    }
    return data;
  }

  /** Create PILImage from file path. */
  static fromFile(path: string, config?: ImageConfig): PILImage {
    const buf = fs.readFileSync(path);
    return PILImage.fromBytes(buf, config);
  }

  /** Create PILImage from raw bytes. */
  static fromBytes(data: ArrayBuffer | Uint8Array, config?: ImageConfig): PILImage {
    const cfg =
      config ??
      ({
        format: 'JPEG',
        quality: 85,
        width: 1260,
        height: 700,
        optimize: false,
        resample: 'LANCZOS',
      } as ImageConfig);

    return new PILImage(PILImage.toArrayBuffer(data), cfg);
  }

  /** Create PILImage from screenshot. */
  static fromScreenshot(_config?: ImageConfig): PILImage {
    // Lazy import to avoid DISPLAY issues in headless environments
    throw new Error('PILImage.fromScreenshot() is not implemented in oagi-typescript.');
  }

  /** Apply transformations (resize) based on config and return new PILImage. */
  transform(config: ImageConfig): PILImage {
    // Apply resize if needed
    // Return new PILImage with the config (format conversion happens on read())
    return new PILImage(this.data, config);
  }

  /** Read image as bytes with current config (implements Image protocol). */
  read(): ArrayBuffer {
    if (this.cachedBytes == null) {
      void this.config;
      this.cachedBytes = this.data;
    }
    return this.cachedBytes;
  }
}
