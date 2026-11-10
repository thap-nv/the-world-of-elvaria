import { defineConfig } from 'vitest/config';

// Root project: tests for the repo scripts in scripts/ and the repo's Claude Code hooks in .claude/hooks/. Each
// workspace runs its own vitest (pnpm -r test).
export default defineConfig({
  test: {
    include: ['scripts/**/*.spec.ts', '.claude/hooks/**/*.spec.ts'],
    // The scripts read the whole repo (docs-check.spec.ts walks every file) and the hooks' specs spawn node: on a busy
    // machine (another worktree's tests) they outlast vitest's 5 s and 10 s defaults (P1-38, P1-40; fixed in P1-39).
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
