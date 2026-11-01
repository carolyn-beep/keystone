import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => ({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'server/**/*.test.ts',
      'shared/**/*.test.ts',
      'client/src/**/*.test.ts',
      'script/**/*.test.ts',
    ],
    // Default the brand selectors so modules that read BRAND at import time
    // (e.g. server/brand/index.ts, which throws when unset) don't fail the
    // suite in environments without a local .env. A real env value still wins.
    env: { BRAND: 'keystone', VITE_BRAND: 'keystone', ...loadEnv(mode, process.cwd(), '') },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './shared'),
      '@': path.resolve(__dirname, './client/src'),
    },
  },
}));
