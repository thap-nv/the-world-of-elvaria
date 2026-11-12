// The machine's run of a party's merge quest (P1-18 proposal (h)): planTick hands its first run to the Steward, and
// the state machine carries a run with no character through review and back to a knight. The run takes a run number
// and no attempt, and a retry from the infirmary does not give it a second one (P1-55).
import { describe, expect, it } from 'vitest';

import { NOW, Q1, Q2, Q3, Q4, character, quest, snapshot } from '../dispatch/__fixtures__/snapshot.ts';
import { planTick } from '../dispatch/plan-tick.ts';
import { MERGE, THORN, at, draftQuest, walk } from '../quest/__fixtures__/quests.ts';
import { transition } from '../quest/transition.ts';
import { machineMergeDue, machineRun } from './machine-merge.ts';
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

  it('gives a merge quest a run was started on to a knight, not to the machine, at no attempt (P1-55)', () => {
    const part = { ...quest(Q2, { party: Q4 }), status: 'done' } as const;
    const ran: Quest = {
      ...quest(Q1, { party: Q4, dependsOn: [Q2] }),
      party_role: 'merge',
      attempts: 0,
      attempt_log: [
        {
          n: 1,
          character: null,
          role: 'assignee',
          started_at: at(1),
          ended_at: at(2),
          outcome: 'submitted',
          run_dir: `.runs/${Q1}-1`,
        },
      ],
    };
    const plan = planTick(snapshot([part, ran], [character('thorn')]), NOW);
    expect(plan).toMatchObject({ merges: [], claims: [{ quest: Q1, assignee: 'thorn' }] });
  });
});

describe('the machine run of a merge quest', () => {
  it('is due only for a session-tier merge quest no run was ever started on', () => {
    expect(machineMergeDue(draftQuest(MERGE))).toBe(true);
    expect(machineMergeDue({ ...draftQuest(MERGE), attempts: 1 })).toBe(false);
    expect(machineMergeDue(draftQuest())).toBe(false);
    // The owner's retry puts `attempts` back to 0 and keeps the log: the machine does not run again.
    const ran = walk(draftQuest(MERGE), ['confirm', 'claim', 'start']);
    expect(machineMergeDue({ ...ran, attempts: 0 })).toBe(false);
  });

  it('is a run no character holds: a session-tier quest with no assignee', () => {
    expect(machineRun(draftQuest(MERGE))).toBe(true);
    expect(machineRun({ ...draftQuest(), assignee: THORN })).toBe(false);
    expect(machineRun({ tier: 'script', assignee: null })).toBe(false);
  });

  it('runs with no character to review, then opens for a knight on a fail or on the owner’s return', () => {
    const judged = walk(draftQuest(MERGE), ['confirm', 'claim', 'start', 'submit', 'assign_verifier']);
    // The machine's run takes a run number, not an attempt: the knights after it keep the whole budget (P1-55).
    expect(judged).toMatchObject({ status: 'review', assignee: null, attempts: 0 });
    expect(judged.attempt_log[0]).toMatchObject({
      n: 1,
      role: 'assignee',
      character: null,
      outcome: 'submitted',
    });
    const failed = transition(judged, { type: 'verdict_fail', at: at(9) }, 'verifier');
    expect(failed).toMatchObject({ ok: true, value: { status: 'open', verifier: null, attempts: 0 } });
    const sealed = walk(draftQuest(MERGE), ['confirm', 'claim', 'start', 'submit', 'verdict_pass']);
    expect(sealed.status).toBe('awaiting_seal');
    const returned = transition(sealed, { type: 'return', at: at(9) }, 'user');
    expect(returned).toMatchObject({ ok: true, value: { status: 'open' } });
    // A stopped merge leaves the run cancelled and the quest open, no attempt spent, and no second machine run.
    const stopped = walk(draftQuest(MERGE), ['confirm', 'claim', 'start', 'release']);
    expect(stopped).toMatchObject({ status: 'open', assignee: null, attempts: 0 });
    expect(machineMergeDue(stopped)).toBe(false);
  });

  it('gives knights max_attempts sessions after a failed machine run, and a retry goes to a knight (P1-55)', () => {
    const failed = walk(draftQuest(MERGE), [
      'confirm',
      'claim',
      'start',
      'submit',
      'assign_verifier',
      'verdict_fail',
    ]);
    expect(machineMergeDue(failed)).toBe(false);
    // A knight takes it, and each of its sessions fails: three (max_attempts), not two, before the infirmary.
    const first = walk(failed, ['claim', 'start', 'submit', 'assign_verifier', 'verdict_fail']);
    expect(first).toMatchObject({ status: 'returned', attempts: 1, assignee: 'thorn' });
    const redo = ['redispatch', 'submit', 'assign_verifier', 'verdict_fail'] as const;
    const second = walk(first, redo);
    expect(second).toMatchObject({ status: 'returned', attempts: 2 });
    const third = walk(second, redo);
    expect(third).toMatchObject({ status: 'infirmary', attempts: 3 });
    // The owner's retry: attempts back to 0, the log of runs kept, nobody holds it, and the machine has no run left.
    const retried = walk(third, ['retry']);
    expect(retried).toMatchObject({ status: 'open', attempts: 0, assignee: null });
    expect(machineMergeDue(retried)).toBe(false);
    const knights = retried.attempt_log.filter(({ role }) => role === 'assignee');
    expect(knights.map(({ character }) => character)).toEqual([null, THORN, THORN, THORN]);
    const taken = walk(retried, ['claim', 'start']);
    expect(taken).toMatchObject({ status: 'working', attempts: 1, assignee: 'thorn' });
  });
});
