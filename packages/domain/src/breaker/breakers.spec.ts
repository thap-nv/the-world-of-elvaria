// breakersOf and planTick's step 3 (implementation-plan §3.1, §3.4): the held sessions that ran past a breaker,
// each timed from its own attempt_log entry.
import { describe, expect, it } from 'vitest';

import {
  NOW,
  Q1,
  Q2,
  Q3,
  Q4,
  character,
  inReview,
  moved,
  quest,
  snapshot,
  workingBy,
} from '../dispatch/__fixtures__/snapshot.ts';
import { planTick } from '../dispatch/plan-tick.ts';
import { breakersOf, tokenCeilingOf } from './breakers.ts';
import type { QuestId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { HeldSession } from './breakers.ts';

/** NOW is minute 120 of the fixture day; the budget is 45 minutes and 400 000 tokens. */
const RULES = { max_turns: 200, verifier_tokens_multiplier: 2 };
const held = (id: QuestId, role: HeldSession['role'], tokens = 0, turns?: number): HeldSession => ({
  quest: id,
  role,
  usage: turns === undefined ? { tokens } : { tokens, turns },
});

/** A quest in review whose verifier opened its session at minute `minute`. */
const judgedBy = (base: Quest, minute: number): Quest =>
  moved(inReview(base, 'thorn', 10), minute, ['assign_verifier', 'steward', { verifier: 'wren' }]);

describe('breakersOf', () => {
  it('stops an assignee past its minutes, one past its tokens, and a verifier past its turns', () => {
    const quests = [
      workingBy(quest(Q1), 'thorn', 75),
      workingBy(quest(Q2), 'brann', 100),
      judgedBy(quest(Q3), 110),
    ];
    expect(
      breakersOf(
        quests,
        [held(Q1, 'assignee'), held(Q2, 'assignee', 400_001), held(Q3, 'verifier', 10, 201)],
        RULES,
        NOW,
      ),
    ).toEqual([
      { quest: Q1, role: 'assignee', trip: 'time', detail: 'ran 45 min, limit 45 min' },
      { quest: Q2, role: 'assignee', trip: 'tokens', detail: '400001 tokens, limit 400000' },
      { quest: Q3, role: 'verifier', trip: 'turns', detail: '201 turns, limit 200' },
    ]);
  });

  it('times a session from its own entry: the verifier of an old attempt starts its own clock', () => {
    const quests = [judgedBy(quest(Q1), 100), workingBy(quest(Q2), 'thorn', 76)];
    expect(breakersOf(quests, [held(Q1, 'verifier'), held(Q2, 'assignee', 400_000)], RULES, NOW)).toEqual([]);
  });

  it('leaves alone a session whose quest or open entry is gone, or whose entry has no readable start', () => {
    const working = workingBy(quest(Q1), 'thorn', 10);
    const unreadable: Quest = {
      ...working,
      attempt_log: working.attempt_log.map((entry) => ({ ...entry, started_at: 'not a time' })),
    };
    const quests = [working, { ...unreadable, id: Q2 }, inReview(quest(Q3), 'thorn', 10)];
    const sessions = [held(Q1, 'verifier'), held(Q2, 'assignee'), held(Q3, 'verifier'), held(Q4, 'assignee')];
    expect(breakersOf(quests, sessions, RULES, NOW)).toEqual([]);
  });

  it("gives a judge verifier_tokens_multiplier times the quest's tokens, the assignee the budget (P1-18 (f))", () => {
    const quests = [judgedBy(quest(Q1), 110), judgedBy(quest(Q2), 110)];
    const sessions = [held(Q1, 'verifier', 800_000), held(Q2, 'verifier', 800_001)];
    expect(breakersOf(quests, sessions, RULES, NOW)).toEqual([
      { quest: Q2, role: 'verifier', trip: 'tokens', detail: '800001 tokens, limit 800000' },
    ]);
    const once = { ...RULES, verifier_tokens_multiplier: 1 };
    expect(breakersOf(quests, [held(Q1, 'verifier', 400_001)], once, NOW)).toEqual([
      { quest: Q1, role: 'verifier', trip: 'tokens', detail: '400001 tokens, limit 400000' },
    ]);
    expect(tokenCeilingOf(quests[0] ?? quest(Q1), 'assignee', RULES)).toBe(400_000);
  });
});

describe('planTick: breakers (§3.4)', () => {
  const thorn = character('thorn', { status: 'working' });

  it('names the sessions the Steward holds that tripped, and keeps their characters busy', () => {
    const quests = [workingBy(quest(Q1), 'thorn', 10), quest(Q2)];
    const plan = planTick(snapshot(quests, [thorn], { sessions: [held(Q1, 'assignee')] }), NOW);
    expect(plan.breakers).toEqual([
      { quest: Q1, role: 'assignee', trip: 'time', detail: 'ran 110 min, limit 45 min' },
    ]);
    expect(plan.claims).toEqual([]);
  });

  it('stops nothing without held sessions (a sandbox day)', () => {
    expect(planTick(snapshot([workingBy(quest(Q1), 'thorn', 10)], [thorn]), NOW).breakers).toEqual([]);
  });
});
