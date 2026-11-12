import { describe, expect, it } from 'vitest';

import {
  KINGDOM,
  NOW,
  Q1,
  Q2,
  Q3,
  Q4,
  character,
  inReview,
  quest,
  snapshot,
} from './__fixtures__/snapshot.ts';
import { planTick } from './plan-tick.ts';
import { ENVIRONMENT_RECHECK_MINUTES, MS_PER_MINUTE } from '../constants.ts';
import type { Instant } from '../core/clock.ts';
import type { QuestId } from '../core/ids.ts';
import type { BackgroundWork } from './reviews.ts';

// The cap on the machine work outside the tick (P1-47, (b) of P1-25): checks and scripts start only while fewer than
// dispatch.max_background run; checks first, and what finds no room waits for a later tick's plan.
const Q5 = 'q_20261106_p4q5r6' as QuestId;
const Q6 = 'q_20261106_s7t8v9' as QuestId;

const JUDGES = [
  character('thorn', { status: 'working' }),
  character('orin', { cls: 'judge', tribe: 'gemini' }),
];

const THIRD = inReview(quest(Q3), 'thorn', 12);
const SCRIPTS = [quest(Q4, { script: true }), quest(Q5, { script: true }), quest(Q6, { script: true })];
/** Three quests in review whose checks are due, and three open script-tier quests. */
const QUESTS = [inReview(quest(Q1), 'thorn'), inReview(quest(Q2), 'thorn', 11), THIRD, ...SCRIPTS];

const withCap = (max: number) => ({ ...KINGDOM, dispatch: { ...KINGDOM.dispatch, max_background: max } });

const planOf = (background: BackgroundWork | undefined, quests = QUESTS, max = 2) =>
  planTick(
    snapshot(quests, JUDGES, {
      kingdom: withCap(max),
      ...(background === undefined ? {} : { background }),
    }),
    NOW,
  );

describe('planTick: the cap on machine work outside the tick', () => {
  it('starts checks first, up to dispatch.max_background, and leaves the rest for a later tick', () => {
    expect(planOf({ running: [], checked: [] })).toMatchObject({ checks: [Q1, Q2], scripts: [] });
    // One of them runs now: one more starts.
    expect(planOf({ running: [Q1], checked: [] })).toMatchObject({ checks: [Q2], scripts: [] });
    // Both slots taken: nothing starts, and nothing is lost: the next plan names them again.
    expect(planOf({ running: [Q1, Q2], checked: [] })).toMatchObject({ checks: [], scripts: [] });
    expect(planOf({ running: [Q2], checked: [Q1] })).toMatchObject({ checks: [Q3], scripts: [] });
  });

  it('gives the room the checks leave to the scripts, highest priority first', () => {
    expect(planOf({ running: [], checked: [] }, SCRIPTS)).toMatchObject({ scripts: [Q4, Q5] });
    expect(planOf({ running: [Q1], checked: [] }, [THIRD, ...SCRIPTS], 3)).toMatchObject({
      checks: [Q3],
      scripts: [Q4],
    });
    // Work running on a quest in no step of this plan (a script working, checks of a quest the judges took) still
    // holds its slot.
    expect(planOf({ running: [Q1], checked: [] }, SCRIPTS)).toMatchObject({ scripts: [Q4] });
  });

  it('caps nothing in a sandbox day, which has no background', () => {
    const plan = planOf(undefined, SCRIPTS, 1);
    expect(plan.scripts).toEqual([Q4, Q5, Q6]);
    expect(plan.checks).toEqual([]);
  });

  it('defaults to two, until a run measures the load', () => {
    expect(KINGDOM.dispatch.max_background).toBe(2);
  });
});

// P1-54, (c) of the P1-50 report: checks that failed because of their environment get no judge; they run again later.
describe('planTick: checks set aside for their environment', () => {
  const endedAt = (minutesBefore: number) => (NOW - minutesBefore * MS_PER_MINUTE) as Instant;

  it('gives them no judge, and no new run before the recheck is due', () => {
    const plan = planOf({ running: [], checked: [], environment: [{ quest: Q1, at: endedAt(1) }] });
    expect(plan.verifications).toEqual([]);
    expect(plan.machine_verdicts).toEqual([]);
    expect(plan.checks).toEqual([Q2, Q3]);
  });

  it('runs them again once the recheck is due', () => {
    const held = { quest: Q1, at: endedAt(ENVIRONMENT_RECHECK_MINUTES) };
    expect(planOf({ running: [], checked: [], environment: [held] }).checks).toEqual([Q1, Q2]);
  });
});
