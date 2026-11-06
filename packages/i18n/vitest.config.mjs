import { defineConfig } from 'vitest/config';

// Plain .mjs, outside tsconfig.json on purpose: i18n also runs in the browser, and vitest/config pulls in Vite's
// types, which reference @types/node (boundaries.mjs NO_NODE_TYPES).
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.spec.ts'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
