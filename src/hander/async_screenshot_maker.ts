/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import type { AsyncImageProvider } from '../types/async-image-provider.js';
import type { Image } from '../types/image.js';
import type { ImageConfig } from '../types/models/image-config.js';
import { ScreenshotMaker } from './screenshot_maker.js';

export class AsyncScreenshotMaker {
  /**
   * Async wrapper for ScreenshotMaker that captures screenshots in a thread pool.
   *
   * This allows screenshot capture to be non-blocking in async contexts,
   * enabling concurrent execution of other async tasks while screenshots are taken.
   */

  private syncScreenshotMaker: ScreenshotMaker;

  constructor(private config?: ImageConfig) {
    /**
     * Initialize with optional image configuration.
     *
     * Args:
     *     config: ImageConfig instance for customizing screenshot format and quality
     */
    this.syncScreenshotMaker = new ScreenshotMaker(config);
    void this.config;
  }

  async call(): Promise<Image> {
    /**
     * Capture a screenshot asynchronously.
     *
     * This prevents screenshot capture from blocking the async event loop,
     * allowing other coroutines to run while the screenshot is being taken.
     *
     * Returns:
     *     Image: The captured screenshot as a PILImage
     */
    return await Promise.resolve(this.syncScreenshotMaker.call());
  }

  async lastImage(): Promise<Image> {
    return await Promise.resolve(this.syncScreenshotMaker.lastImage());
  }
}

export const createAsyncScreenshotMaker = (config?: ImageConfig): AsyncImageProvider => {
  const maker = new AsyncScreenshotMaker(config);

  const provider = (async () => maker.call()) as AsyncImageProvider;
  provider.lastImage = async () => maker.lastImage();

  return provider;
};
