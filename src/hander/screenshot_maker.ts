/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import type { ImageProvider } from '../types/image-provider.js';
import type { ImageConfig } from '../types/models/image-config.js';
import type { Image } from '../types/image.js';
import { PILImage } from './pil_image.js';

export class ScreenshotMaker {
  /** Takes screenshots using pyautogui. */

  private last: PILImage | null = null;

  constructor(private config?: ImageConfig) {}

  /** Take and process a screenshot. */
  public call(): Image {
    // Create PILImage from screenshot
    let pilImage = PILImage.fromScreenshot();

    // Apply transformation if config is set
    if (this.config) {
      pilImage = pilImage.transform(this.config);
    }

    // Store as the last image
    this.last = pilImage;

    return pilImage;
  }

  public lastImage(): Image {
    /** Return the last screenshot taken, or take a new one if none exists. */
    if (this.last == null) {
      return this.call();
    }
    return this.last;
  }
}

export const createScreenshotMaker = (config?: ImageConfig): ImageProvider => {
  const maker = new ScreenshotMaker(config);

  const provider = (() => maker.call()) as ImageProvider;
  provider.lastImage = () => maker.lastImage();

  return provider;
};
