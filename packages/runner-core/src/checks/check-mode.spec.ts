// The check mode of a run (CM-01, ADR 0032): a narrow territory runs narrow commands unless the quest touched what
// the narrow commands cannot vouch for; a territory that names no policy runs in full as before.
import { TerritorySchema } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { checkLinesOf, checkModeOf } from './check-mode.ts';

const territoryOf = (policy?: Record<string, unknown>, delivery?: Record<string, unknown>) =>
  TerritorySchema.parse({
    version: 1,
    id: 'elvaria',
    name: 'Elvaria',
    path: 'D:/Dummy/Tool - Personal/elvaria',
    kind: 'code',
    vcs: { type: 'git', default_branch: 'main', remote: 'https://github.com/owner/repo.git' },
    checks: [
      {
        id: 'lint',
        run: 'pnpm lint',
        narrow: 'pnpm check:changed --only lint',
        when: ['**/*.ts'],
        timeout_minutes: 5,
      },
      {
        id: 'test',
        run: 'pnpm test',
        narrow: ['pnpm check:changed --only test'],
        when: ['packages/**'],
        timeout_minutes: 30,
      },
      { id: 'docs', run: 'pnpm docs:check', when: ['docs/**'], timeout_minutes: 5 },
    ],
    ...(policy === undefined ? {} : { check_policy: policy }),
    ...(delivery === undefined ? {} : { delivery }),
  });

const NARROW = territoryOf({ mode: 'narrow', full_when: ['package.json', 'scripts/**'] });
const SESSION = { pass: 'session' } as const;
const CODE = ['packages/domain/src/a.ts', 'docs/plan.md'];

describe('checkModeOf', () => {
  it('runs in full on a territory that names no policy, or names full, whatever the quest touched', () => {
    expect(checkModeOf(territoryOf(), CODE, SESSION)).toBe('full');
    expect(checkModeOf(territoryOf({ mode: 'full' }), CODE, { pass: 'queue' })).toBe('full');
  });

  it('runs narrow after a session and in the queue when every path is watched and none forces full', () => {
    expect(checkModeOf(NARROW, CODE, SESSION)).toBe('narrow');
    expect(checkModeOf(NARROW, CODE, { pass: 'queue' })).toBe('narrow');
    expect(checkModeOf(NARROW, [], SESSION)).toBe('narrow');
  });

  it('runs in full when the quest touched a path of full_when, Windows separators and all', () => {
    expect(checkModeOf(NARROW, [...CODE, 'package.json'], SESSION)).toBe('full');
    expect(checkModeOf(NARROW, ['scripts\\check-changed.mjs'], { pass: 'queue' })).toBe('full');
  });

  it('runs in full when the quest touched a path no check watches', () => {
    expect(checkModeOf(NARROW, [...CODE, 'README.md'], SESSION)).toBe('full');
    expect(checkModeOf(territoryOf({ mode: 'narrow' }), ['.gitattributes'], SESSION)).toBe('full');
  });

  it("runs a party's merge quest and a quest judged in a scratch plot in full, in every mode", () => {
    expect(checkModeOf(NARROW, CODE, { ...SESSION, role: 'merge' })).toBe('full');
    expect(checkModeOf(NARROW, CODE, { pass: 'queue', role: 'merge' })).toBe('full');
    expect(checkModeOf(NARROW, CODE, { ...SESSION, scratch: true })).toBe('full');
    expect(checkModeOf(NARROW, CODE, { ...SESSION, role: 'part', scratch: false })).toBe('narrow');
  });

  it('runs deferred as narrow after a session, and the queue in full until the train of CM-08', () => {
    const deferred = territoryOf({ mode: 'deferred' }, { mode: 'pr_merge' });
    expect(checkModeOf(deferred, CODE, SESSION)).toBe('narrow');
    expect(checkModeOf(deferred, CODE, { pass: 'queue' })).toBe('full');
  });
});

describe('checkLinesOf', () => {
  const [lint, test, docs] = NARROW.checks;

  it("runs a check's narrow command in a narrow run, its run where it has none", () => {
    expect(checkLinesOf(lint!, 'narrow')).toBe('pnpm check:changed --only lint');
    expect(checkLinesOf(test!, 'narrow')).toEqual(['pnpm check:changed --only test']);
    expect(checkLinesOf(docs!, 'narrow')).toBe('pnpm docs:check');
  });

  it('runs `run` in a full run, a narrow command declared or not', () => {
    expect(checkLinesOf(lint!, 'full')).toBe('pnpm lint');
    expect(checkLinesOf(test!, 'full')).toBe('pnpm test');
  });
});
