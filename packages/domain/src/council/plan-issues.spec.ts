import { describe, expect, it } from 'vitest';

import { described, subquest } from './__fixtures__/drafts.ts';
import { peakContextOf, questEstimateOf } from './estimate.ts';
import { planIssueLine, planIssuesOf } from './plan-issues.ts';
import { ClassIdSchema } from '../core/ids.ts';
import type { PlanContext } from './plan-issues.ts';
import type { QuestDraft } from '../schema/quest/quest-draft.ts';

const ELVARIA = {
  id: 'elvaria',
  shared_paths: [{ glob: 'packages/domain/src/index.ts', merge: 'union' as const }],
  checks: [{ id: 'typecheck' }, { id: 'unit' }],
} as unknown as PlanContext['territories'][number];
type Member = PlanContext['characters'][number];
const member = (cls: string, status: Member['status']): Member => ({
  class: ClassIdSchema.parse(cls),
  status,
});
const KNIGHT = member('knight', 'idle');
const CONTEXT: PlanContext = {
  territories: [ELVARIA],
  context_budget_tokens: 120_000,
  characters: [KNIGHT],
};

const linesOf = (...drafts: QuestDraft[]) => planIssuesOf(drafts, CONTEXT).map(planIssueLine);

describe('planIssuesOf (the machine half of the plan review, PS-06)', () => {
  it('passes parts apart, parts in a row, and parts that meet only on the shared paths', () => {
    const domain = subquest('d1', ['packages/domain/**']);
    expect(linesOf(domain, subquest('d2', ['apps/cli/**']))).toEqual([]);
    const third = subquest('d3', ['packages/domain/src/x.ts'], { depends_on_refs: ['d2'] });
    expect(linesOf(domain, subquest('d2', ['apps/cli/**']), third)).toEqual([
      'd1 and d3 may run at once and their scopes meet: one waits for the other (depends_on_refs), or their scopes part',
    ]);
    // d3 waits for d2, which waits for d1: never at once.
    const throughD2 = subquest('d2', ['apps/cli/**'], { depends_on_refs: ['d1'] });
    expect(linesOf(domain, throughD2, third)).toEqual([]);
    // A ref outside the list (the schema refuses it, the Steward too) orders nothing.
    const stray = subquest('d2', ['packages/domain/src/y.ts'], { depends_on_refs: ['d9'] });
    expect(linesOf(domain, stray)).toHaveLength(1);
    const circle = subquest('d2', ['apps/cli/**'], { depends_on_refs: ['d3'] });
    expect(linesOf(domain, circle, third)).toHaveLength(1);
    const hot = 'packages/domain/src/index.ts';
    expect(linesOf(subquest('d1', ['packages/domain/src/council/**', hot]), subquest('d2', [hot]))).toEqual(
      [],
    );
  });

  it('returns two parts that may run at once on one territory whose scopes meet, whatever the judge says', () => {
    expect(
      linesOf(subquest('d1', ['packages/domain/**']), subquest('d2', ['packages/domain/src/x.ts'])),
    ).toEqual([
      'd1 and d2 may run at once and their scopes meet: one waits for the other (depends_on_refs), or their scopes part',
    ]);
    const elsewhere = subquest('d2', ['packages/domain/**'], { territory: 'dc1' });
    expect(linesOf(subquest('d1', ['packages/domain/**']), elsewhere)).toEqual([]);
  });

  it('returns a session part without scope_paths; a script part needs none', () => {
    const script = subquest('d2', [], { tier: 'script', script: { id: 'count-files', params: {} } });
    expect(linesOf(subquest('d1', []), script)).toEqual([
      'd1 has no scope_paths: a sub-quest that changes files names them',
    ]);
  });

  it('returns a part whose peak context passes the budget, and trusts no tokens for it', () => {
    const wide = subquest('d1', ['a/**'], { estimate: { tokens: 900_000, minutes: 60, context: 150_000 } });
    expect(linesOf(wide)).toEqual(['d1 holds 150000 tokens of context at its peak, above 120000: split it']);
    expect(linesOf(subquest('d1', ['a/**'], { estimate: { tokens: 900_000, minutes: 60 } }))).toEqual([]);
  });

  it('returns a part whose description misses the template, or names a check the territory lacks', () => {
    const lacking = subquest('d1', ['a/**'], { description: described(['Done when']) });
    const unknown = subquest('d2', ['b/**'], { description: described().replace('`typecheck`', '`e2e`') });
    expect(linesOf(lacking, unknown)).toEqual([
      'd1: no "## Done when" section, or it is empty',
      'd2: "Done when" names check `e2e`, which its territory does not have',
    ]);
    const nowhere = subquest('d3', ['c/**'], {
      territory: 'gone',
      description: described().replace('`typecheck`', '`e2e`'),
    });
    expect(linesOf(nowhere)).toEqual([]);
  });

  it('returns a session part whose class no character has that is not suspended (fix/council-run-gaps (c))', () => {
    const dwarf = subquest('d2', ['b/**'], { class_required: 'dwarf' });
    const script = subquest('d3', [], { tier: 'script', script: { id: 'count-files', params: {} } });
    const { class_required: _none, ...classless } = script;
    expect(linesOf(subquest('d1', ['a/**']), dwarf, classless)).toEqual([
      'd2 asks for class dwarf, which no character of the kingdom has that is not suspended: give it to a class the kingdom has (knight)',
    ]);
    const suspended = member('dwarf', 'suspended');
    const lines = planIssuesOf([dwarf], { ...CONTEXT, characters: [suspended, KNIGHT, KNIGHT] }).map(
      planIssueLine,
    );
    expect(lines).toHaveLength(1);
    const none = planIssuesOf([dwarf], { ...CONTEXT, characters: [suspended] }).map(planIssueLine);
    expect(none[0]).toContain('class the kingdom has (none)');
    const brom = member('dwarf', 'working');
    expect(planIssuesOf([dwarf], { ...CONTEXT, characters: [brom] })).toEqual([]);
  });

  it('measures a draft by its peak context, its tokens standing in, and keeps tokens and minutes for the quest', () => {
    expect(peakContextOf({ tokens: 300_000, minutes: 30, context: 90_000 })).toBe(90_000);
    expect(peakContextOf({ tokens: 300_000, minutes: 30 })).toBe(300_000);
    expect(questEstimateOf({ tokens: 300_000, minutes: 30, context: 90_000 })).toEqual({
      tokens: 300_000,
      minutes: 30,
    });
  });
});
