import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    // The process specs start Node children, one per hook call; Windows CI machines are slow to spawn them.
    testTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // elvaria-hook.ts only wires process stdin/env/exit code to runHook; hook-process.spec.ts runs it built.
      exclude: ['src/**/*.spec.ts', 'src/**/__fixtures__/**', 'src/elvaria-hook.ts'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
