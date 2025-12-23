import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: './src/index.ts',
    cli: 'src/cli.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  publicDir: 'src/agent/observer',
  banner: {
    js: '#!/usr/bin/env node',
  },
  target: 'esnext',
});
