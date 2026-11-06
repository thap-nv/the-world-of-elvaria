import { defineConfig } from 'vitest/config';

// Plain .mjs, outside tsconfig.json on purpose: vitest/config pulls in Vite's types, which reference
// @types/node, and one such file would make `process` and `node:fs` type-check everywhere in the domain.
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts'],
      // The domain decides; every branch of a decision is tested (CLAUDE.md, ADR 0002).
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
