import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    // The plot, check and process specs spawn git, node and process trees, and their hooks make git repos: on a busy
    // machine (another worktree's tests) they outlast vitest's 5 s and 10 s defaults, and a git-heavy party spec its
    // own 30 s (P1-39). One timeout for every spec and hook, with room to spare: it only ever stops a hung test.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts', 'src/**/__fixtures__/**'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
