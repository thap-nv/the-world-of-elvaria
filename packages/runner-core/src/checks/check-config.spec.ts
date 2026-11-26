// The fingerprint of a territory's check commands (RC-03, ADR 0035): an edit of commands.setup or of a check's id,
// `run` or `narrow` changes it; what only chooses the checks (`when`, the timeouts, the order) does not.
import { TerritorySchema } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { checkConfigOf } from './check-config.ts';

const LINT = {
  id: 'lint',
  run: 'pnpm lint',
  narrow: 'pnpm lint:changed',
  when: ['**/*.ts'],
  timeout_minutes: 5,
};
const TEST = { id: 'test', run: 'pnpm test', when: ['src/**'], timeout_minutes: 30 };

const territory = (checks: unknown[], setup: string | null = 'pnpm install') =>
  TerritorySchema.parse({
    version: 1,
    id: 'dc1',
    name: 'dc1',
    path: '/repos/dc1',
    kind: 'code',
    vcs: { type: 'none' },
    commands: setup === null ? {} : { setup },
    checks,
  });

const BEFORE = checkConfigOf(territory([LINT, TEST]));

describe('checkConfigOf', () => {
  it('is sixteen hex digits, the same for the same commands', () => {
    expect(BEFORE).toMatch(/^[0-9a-f]{16}$/);
    expect(checkConfigOf(territory([LINT, TEST]))).toBe(BEFORE);
  });

  it("changes with commands.setup, or a check's id, run or narrow command", () => {
    const changed = [
      territory([LINT, TEST], 'pnpm install --frozen-lockfile'),
      territory([LINT, TEST], null),
      territory([LINT, { ...TEST, id: 'unit' }]),
      territory([LINT, { ...TEST, run: 'pnpm test --coverage' }]),
      territory([{ ...LINT, narrow: 'pnpm lint:staged' }, TEST]),
      territory([{ ...LINT, narrow: undefined }, TEST]),
      territory([LINT]),
    ].map(checkConfigOf);
    expect(changed).not.toContain(BEFORE);
    expect(new Set(changed).size).toBe(changed.length);
  });

  it('stays the same when only when, a timeout, the order of the checks or a one-line list changes', () => {
    const same = [
      territory([TEST, LINT]),
      territory([{ ...LINT, when: ['src/**/*.ts'], timeout_minutes: 9 }, TEST]),
      territory([LINT, { ...TEST, run: ['pnpm test'] }]),
    ].map(checkConfigOf);
    expect(same).toEqual([BEFORE, BEFORE, BEFORE]);
  });
});
