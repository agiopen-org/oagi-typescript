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
 * Platform information and SDK headers for analytics.
 */

import { createRequire } from 'module';

const SDK_NAME = 'oagi-typescript';

/**
 * Get the SDK version from package.json.
 */
export function getSdkVersion(): string {
  try {
    const require = createRequire(import.meta.url);

    // In dist, files may live under dist/*, so try both
    for (const p of ['../package.json', '../../package.json']) {
      try {
        const pkg = require(p) as { version?: string };
        if (pkg.version && pkg.version !== '0.0.0') return pkg.version;
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }

  return 'unknown';
}

/**
 * Build User-Agent string.
 *
 * Example: oagi-typescript/0.1.4 (node v20.10.0; darwin; arm64)
 */
export function getUserAgent(): string {
  return `${SDK_NAME}/${getSdkVersion()} (node ${process.version}; ${process.platform}; ${process.arch})`;
}

/**
 * Get SDK headers for API requests.
 *
 * Returns headers for both debugging (User-Agent) and structured analytics
 * (x-sdk-* headers).
 */
export function getSdkHeaders(): Record<string, string> {
  return {
    'User-Agent': getUserAgent(),
    'x-sdk-name': SDK_NAME,
    'x-sdk-version': getSdkVersion(),
    'x-sdk-language': 'typescript',
    'x-sdk-language-version': process.version,
    'x-sdk-os': process.platform,
    'x-sdk-platform': process.arch,
  };
}
