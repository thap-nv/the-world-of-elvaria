import { TerritorySchema } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { flakeRerunsOf } from './flake-reruns.ts';

// What flake_check runs again (P1-54, (f) of the P1-50 report).
const checksOf = (checks: unknown[]) =>
  TerritorySchema.parse({
    version: 1,
    id: 'dc1',
    name: 'dc1',
    path: '/repos/dc1',
    kind: 'code',
    vcs: { type: 'none' },
    checks,
  }).checks;

const lint = { id: 'lint', run: 'pnpm lint', when: ['**'], timeout_minutes: 5 };
const e2e = { id: 'e2e', run: 'pnpm e2e', when: ['apps/web/**'], exclusive: true, timeout_minutes: 60 };
const SPECS = { specs: ['apps/web/e2e/**/*.spec.ts'] };

describe('flakeRerunsOf', () => {
  it('runs every check again when none may flake, as before P1-54', () => {
    const checks = checksOf([lint, e2e]);
    expect(flakeRerunsOf(checks, ['apps/web/e2e/a.spec.ts'])).toEqual(checks);
  });

  it('runs again only the checks that may flake, whole when the quest touched none of their specs', () => {
    const checks = checksOf([lint, { ...e2e, flake: { ...SPECS, run: 'pnpm e2e {specs}' } }]);
    expect(flakeRerunsOf(checks, ['apps/api/src/a.ts'])).toEqual([checks[1]]);
  });

  it('puts the specs the quest touched in place of {specs}, each one word, in every command of the check', () => {
    const run = ['pnpm e2e:up', 'pnpm exec playwright test --repeat-each=1 {specs}'];
    const [check] = checksOf([{ ...e2e, flake: { ...SPECS, run } }]);
    const touched = ['apps\\web\\e2e\\a.spec.ts', 'apps/web/e2e/say "hi".spec.ts', 'apps/web/src/b.ts'];
    expect(flakeRerunsOf([check!], touched)[0]?.run).toEqual([
      'pnpm e2e:up',
      `pnpm exec playwright test --repeat-each=1 "apps/web/e2e/a.spec.ts" 'apps/web/e2e/say "hi".spec.ts'`,
    ]);
    // A path no quote can hold is left out rather than split.
    expect(flakeRerunsOf([check!], [`apps/web/e2e/it's "odd".spec.ts`])[0]?.run).toEqual(e2e.run);
  });

  it('keeps a check with no command for its specs whole', () => {
    const [check] = checksOf([{ ...e2e, flake: SPECS }]);
    expect(flakeRerunsOf([check!], ['apps/web/e2e/a.spec.ts'])).toEqual([check]);
  });
});
