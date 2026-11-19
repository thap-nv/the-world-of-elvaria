// sessionReadingsOf (PS-28): every held session read once, the breakers' verdict and the stamina bar from the same
// ceilings, so a judge's bar runs to its token ceiling times verifier_tokens_multiplier.
import { describe, expect, it } from 'vitest';

import { NOW, Q1, Q2, Q3, inReview, moved, quest, workingBy } from '../dispatch/__fixtures__/snapshot.ts';
import { sessionReadingsOf, wrapUpsIn } from './breakers.ts';
import type { HeldSession } from './breakers.ts';

const RULES = { max_turns: 200, verifier_tokens_multiplier: 2 };
const held = (quest: HeldSession['quest'], role: HeldSession['role'], tokens: number): HeldSession => ({
  quest,
  role,
  usage: { tokens },
});
// Budget 400 000 tokens and 45 minutes; the assignee started at minute 110 and the judge at 110 too, NOW is 120.
const working = workingBy(quest(Q1), 'thorn', 110);
const judged = moved(inReview(quest(Q2), 'thorn', 10), 110, [
  'assign_verifier',
  'steward',
  { verifier: 'wren' },
]);

describe('sessionReadingsOf', () => {
  it("reads a judge's bar against twice the budget, with no reminder mark", () => {
    const [judge] = sessionReadingsOf([judged], [held(Q2, 'verifier', 720_000)], RULES, NOW);
    expect(judge).toMatchObject({
      quest: Q2,
      role: 'verifier',
      verdict: { kind: 'wrap_up', limit: 800_000 },
      stamina: {
        role: 'verifier',
        measure: 'tokens',
        limit: 800_000,
        pct: 90,
        left_pct: 40,
        notch: 6,
        mark_left_pct: undefined,
        zone: 'ok',
      },
    });
  });

  it('reads every held session, a healthy one too, and skips a session whose quest is gone', () => {
    const readings = sessionReadingsOf(
      [working, judged],
      [held(Q1, 'assignee', 360_000), held(Q2, 'verifier', 4_000), held(Q3, 'assignee', 1)],
      RULES,
      NOW,
    );
    expect(readings.map(({ quest, verdict, stamina }) => [quest, verdict, stamina.zone])).toEqual([
      [Q1, { kind: 'wrap_up', measure: 'tokens', used: 360_000, limit: 400_000, pct: 90 }, 'wrap_up'],
      [Q2, 'ok', 'ok'],
    ]);
    expect(readings[1]?.stamina).toMatchObject({ measure: 'time', used: 10, limit: 45 });
    expect(wrapUpsIn(readings)).toEqual([
      {
        quest: Q1,
        role: 'assignee',
        kind: 'wrap_up',
        measure: 'tokens',
        used: 360_000,
        limit: 400_000,
        pct: 90,
      },
    ]);
  });
});
