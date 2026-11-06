import { defineConfig } from 'vitest/config';

// Root project: tests for the repo scripts in scripts/. Each workspace runs its own vitest (pnpm -r test).
export default defineConfig({
  test: { include: ['scripts/**/*.spec.ts'] },
});
