// The machine's run of a party's merge quest (P1-18 proposal (h)): planTick hands its first run to the Steward, and
// the state machine carries a run with no character through review and back to a knight.
import { describe, expect, it } from 'vitest';

import { NOW, Q1, Q2, Q3, Q4, character, quest, snapshot } from '../dispatch/__fixtures__/snapshot.ts';
import { planTick } from '../dispatch/plan-tick.ts';
import { MERGE, at, draftQuest, walk } from '../quest/__fixtures__/quests.ts';
import { transition } from '../quest/transition.ts';
import { machineMergeDue } from './machine-merge.ts';
import type { Quest } from '../schema/quest/quest.ts';

describe('planTick: merges', () => {
  it("hands a party's merge quest to the machine for its first run, then to a knight", () => {
    const part = { ...quest(Q2, { party: Q4 }), status: 'done' } as const;
    const merge = (attempts: number): Quest => ({
      ...quest(Q1, { party: Q4, dependsOn: [Q2] }),
      party_role: 'merge',
      attempts,
    });
    // A merge quest whose part is not done yet waits like any other quest.
    const waiting = { ...merge(0), id: Q3, depends_on: [Q4] };
    const plan = planTick(snapshot([part, merge(0), waiting], [character('thorn')]), NOW);
    expect(plan).toMatchObject({ claims: [], merges: [Q1], unclaimable: [] });
    const after = planTick(snapshot([part, merge(1)], [character('thorn')]), NOW);
    expect(after).toMatchObject({ merges: [], claims: [{ quest: Q1, assignee: 'thorn' }] });
  });
});

describe('the machine run of a merge quest', () => {
  it('is due only for a session-tier merge quest with no run yet', () => {
    expect(machineMergeDue(draftQuest(MERGE))).toBe(true);
    expect(machineMergeDue({ ...draftQuest(MERGE), attempts: 1 })).toBe(false);
    expect(machineMergeDue(draftQuest())).toBe(false);
  });

  it('runs with no character to review, then opens for a knight on a fail or on the owner’s return', () => {
    const judged = walk(draftQuest(MERGE), ['confirm', 'claim', 'start', 'submit', 'assign_verifier']);
    expect(judged).toMatchObject({ status: 'review', assignee: null, attempts: 1 });
    expect(judged.attempt_log[0]).toMatchObject({ role: 'assignee', character: null, outcome: 'submitted' });
    const failed = transition(judged, { type: 'verdict_fail', at: at(9) }, 'verifier');
    expect(failed).toMatchObject({ ok: true, value: { status: 'open', verifier: null, attempts: 1 } });
    const sealed = walk(draftQuest(MERGE), ['confirm', 'claim', 'start', 'submit', 'verdict_pass']);
    expect(sealed.status).toBe('awaiting_seal');
    const returned = transition(sealed, { type: 'return', at: at(9) }, 'user');
    expect(returned).toMatchObject({ ok: true, value: { status: 'open' } });
    // A stopped merge leaves the run cancelled and the quest open, its attempt spent.
    const stopped = walk(draftQuest(MERGE), ['confirm', 'claim', 'start', 'release']);
    expect(stopped).toMatchObject({ status: 'open', assignee: null, attempts: 1 });
    expect(machineMergeDue(stopped)).toBe(false);
  });
});
