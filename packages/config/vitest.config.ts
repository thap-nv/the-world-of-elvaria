import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only this package's own specs; __fixtures__/ holds a fake repo for depcruise.spec.ts.
    include: ['*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['*.mjs'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
