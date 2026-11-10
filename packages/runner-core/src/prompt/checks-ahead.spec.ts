// The checks a continuing session's work will meet (P1-43, (d) of P1-37), and the owner's return for a new judgement
// (P1-43, (d) of P1-40): what a revived or returned assignee reads before it starts.
import { QuestSchema, TerritorySchema, VerdictSchema } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';
import type { PartyRole } from '@elvaria/domain';

import { LETTER, QUEST, RETURNED, TERRITORY } from '../__fixtures__/world.ts';
import { selectChecks } from '../checks/select-checks.ts';
import { continuationBlock } from './blocks.ts';
import { checksAheadBlock } from './checks.ts';
import { loadPromptTemplates } from './templates.ts';

const templates = await loadPromptTemplates();
const memory = { handover: LETTER, journal: [], git_log: null };
const API_FILE = 'apps/api/src/orders.ts';

/** dc1's checks after P1-37: the drift check and e2e left to a party's merge quest. */
const PARTY_TERRITORY = TerritorySchema.parse({
  ...TERRITORY,
  checks: [
    ...TERRITORY.checks.filter(({ id }) => id !== 'e2e'),
    {
      id: 'e2e',
      run: 'pnpm e2e',
      when: ['apps/web/src/routes/**'],
      defer_to_merge: true,
      timeout_minutes: 60,
    },
    {
      id: 'openapi_drift',
      run: ['pnpm api:openapi', 'git diff --exit-code'],
      when: ['apps/api/**'],
      defer_to_merge: true,
      timeout_minutes: 10,
    },
  ],
});

const ahead = (touched: readonly string[] | undefined, role?: PartyRole, territory = PARTY_TERRITORY) =>
  checksAheadBlock(territory, role, touched, templates);

describe('the checks ahead of a continuing session', () => {
  it('lists the checks selectChecks picks for what the branch touches, then those that may still run', () => {
    const text = ahead([API_FILE], undefined, TERRITORY);
    const picked = selectChecks(TERRITORY.checks, [API_FILE]).map(({ id }) => id);
    expect(picked).toEqual(['lint', 'unit']);
    expect(text).toContain('## Machine checks on your work');
    expect(text).toContain('- `lint`: `pnpm lint`\n- `unit`: `pnpm -r test`');
    expect(text).toContain(
      'These run too if your work touches a path they watch: `e2e` (`apps/web/src/routes/**`).',
    );
    // A single quest defers nothing to a merge quest.
    expect(text).not.toContain('never run');
  });

  it('names the checks a contract quest leaves to the merge quest, the drift check its letter chased', () => {
    const text = ahead([API_FILE], 'contract');
    expect(text).toContain('- `lint`: `pnpm lint`\n- `unit`: `pnpm -r test`\n\n');
    expect(text).toContain('so do not change your work to make them pass: `e2e`, `openapi_drift`.');
    expect(text).not.toContain('These run too');
    // Not deferred, a single quest's drift check runs, every command of it named in order.
    expect(ahead([API_FILE])).toContain('- `openapi_drift`: `pnpm api:openapi`, then `git diff --exit-code`');
  });

  it('runs everything on a merge quest and nothing on the acceptance part', () => {
    const merge = ahead([], 'merge');
    expect(merge).toContain('- `e2e`: `pnpm e2e`\n- `openapi_drift`:');
    expect(merge).not.toContain('These');
    const acceptance = ahead([API_FILE], 'acceptance');
    expect(acceptance).toContain('None: no check watches what the branch touches now.');
    expect(acceptance).toContain('pass: `lint`, `unit`, `e2e`, `openapi_drift`.');
  });

  it('says none run yet on a branch that touched nothing', () => {
    expect(ahead([], 'part')).toContain(
      'None: no check watches what the branch touches now.\n\nThese run too if your work touches a path they watch: `lint` (`**/*.ts`), `unit` (`apps/**/*.ts`).',
    );
  });

  it('is left out without what the branch touched, or without a check', () => {
    expect(ahead(undefined)).toBe('');
    expect(ahead([API_FILE], undefined, TerritorySchema.parse({ ...TERRITORY, checks: [] }))).toBe('');
  });

  it('follows the verdict of a return and the revival text, before the letter', () => {
    const party = QuestSchema.parse({ ...QUEST, party_id: QUEST.id, party_role: 'contract' });
    const continuations = [
      { reason: 'returned', verdict: RETURNED, touched: [API_FILE], ...memory },
      { reason: 'revive', touched: [API_FILE], ...memory },
    ] as const;
    for (const continuation of continuations) {
      const text = continuationBlock(party, PARTY_TERRITORY, continuation, templates);
      const section = text.indexOf('## Machine checks on your work');
      expect(section).toBeGreaterThan(0);
      expect(section).toBeLessThan(text.indexOf('## Handover letter so far'));
      expect(text).toContain('`openapi_drift`. The party');
    }
  });
});

describe("the owner's return for a new judgement (rejudge, P1-40)", () => {
  const OWNER_RETURN = VerdictSchema.parse({
    ...RETURNED,
    id: `${QUEST.id}-1-user`,
    verifier_id: 'user',
    fail_kind: 'other',
    notes: 'Sable passed it without breaking anything.',
    rejudge: true,
    by_human: true,
  });
  const returned = (verdict: typeof RETURNED) =>
    continuationBlock(QUEST, TERRITORY, { reason: 'returned', verdict, ...memory }, templates);

  it('says the judge erred and the work goes in again unchanged, before the verdict', () => {
    const text = returned(OWNER_RETURN);
    const said = text.indexOf('it was the owner who sent it back, for a new judgement (`rejudge`)');
    expect(said).toBeGreaterThan(0);
    expect(said).toBeLessThan(text.indexOf('## Verdict'));
    expect(text).toContain('Hand the same work in again, unchanged unless the owner');
  });

  it("is left out of a judge's fail and of an owner's plain return", () => {
    expect(returned(RETURNED)).not.toContain('rejudge');
    const { rejudge: _rejudge, ...plain } = OWNER_RETURN;
    expect(returned(VerdictSchema.parse(plain))).not.toContain('rejudge');
    expect(returned(RETURNED)).toContain('then finish again. This session is new');
  });
});
