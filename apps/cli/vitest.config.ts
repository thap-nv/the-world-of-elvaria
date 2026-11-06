import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    // Commands spawn git and fake CLIs; Windows CI starts processes slowly.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // cli.ts and node-io.ts wire the real process; cli.spec.ts runs them as a child, outside coverage.
      exclude: ['src/**/*.spec.ts', 'src/cli.ts'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
