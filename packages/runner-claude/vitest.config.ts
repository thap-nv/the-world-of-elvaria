import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    // Specs spawn the fake CLI (a Node process per session), which a slow CI machine starts in seconds.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/__fixtures__/**'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
