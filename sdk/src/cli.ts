/**
 * -----------------------------------------------------------------------------
 *  Copyright (c) OpenAGI Foundation
 *  All rights reserved.
 *
 *  This file is part of the official API project.
 *  Licensed under the MIT License.
 * -----------------------------------------------------------------------------
 */

import { main } from './cli/main.js';

main().catch(err => {
  process.stderr.write(`Unexpected error: ${String(err)}\n`);
  process.exitCode = 1;
});
