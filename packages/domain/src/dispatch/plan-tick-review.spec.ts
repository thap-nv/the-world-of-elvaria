import { describe, expect, it } from 'vitest';

import {
  KINGDOM,
  NOW,
  Q1,
  Q2,
  Q3,
  character,
  inReview,
  quest,
  returnedTo,
  snapshot,
  workingBy,
} from './__fixtures__/snapshot.ts';
import { planTick } from './plan-tick.ts';

// Step 4 of the tick with selectVerifier (P1-04), and the fail streak that comes before any work.
describe('planTick: judges and the fail streak', () => {
  it('prefers a judge of another model family, and keeps every member of the party off its quests', () => {
    const judges = [
      character('thorn', { status: 'working' }),
      character('sable', { cls: 'judge', model: 'claude-opus-5-5', since: 0 }),
      character('orin', { cls: 'judge', tribe: 'gemini', since: 50 }),
    ];
    const plan = planTick(snapshot([inReview(quest(Q1), 'thorn')], judges), NOW);
    expect(plan.verifications).toEqual([{ quest: Q1, verifier: 'orin', reason: 'other_family' }]);
    // orin worked the contract quest of Q2's party, so it never judges a quest of that party (ADR 0020).
    const contract = workingBy(quest(Q1, { party: Q1 }), 'orin');
    const part = inReview(quest(Q2, { party: Q1 }), 'thorn');
    const party = planTick(snapshot([contract, part], judges), NOW);
    expect(party.verifications).toEqual([
      { quest: Q2, verifier: 'sable', reason: 'same_family_other_model' },
    ]);
  });

  it('lets the machine judge under machine_only when no judge of another family serves the kingdom', () => {
    const machineOnly = {
      kingdom: {
        ...KINGDOM,
        dispatch: { ...KINGDOM.dispatch, verifier_same_family: 'machine_only' as const },
      },
    };
    const sameFamily = [
      character('thorn', { status: 'working' }),
      character('sable', { cls: 'judge', model: 'claude-opus-5-5' }),
    ];
    const plan = planTick(snapshot([inReview(quest(Q1), 'thorn')], sameFamily, machineOnly), NOW);
    expect(plan).toMatchObject({ verifications: [], machine_verdicts: [Q1] });
    // A judge of another family who is only busy for now: the quest waits for it.
    const busy = [...sameFamily, character('orin', { cls: 'judge', tribe: 'gemini', status: 'reviewing' })];
    const waits = planTick(snapshot([inReview(quest(Q1), 'thorn')], busy, machineOnly), NOW);
    expect(waits).toMatchObject({ verifications: [], machine_verdicts: [] });
  });

  it('names a submitted quest no judge of the roster may ever take under different_model (P1-15)', () => {
    const review = [inReview(quest(Q1), 'thorn')];
    // vesper is a judge on the assignee's own model: it never judges thorn's work.
    const sameModel = [character('thorn', { status: 'working' }), character('vesper', { cls: 'judge' })];
    expect(planTick(snapshot(review, sameModel), NOW)).toMatchObject({
      verifications: [],
      machine_verdicts: [],
      unjudgeable: [Q1],
    });
    // A judge who may take it but is busy for now: the quest only waits.
    const busy = [...sameModel, character('orin', { cls: 'judge', tribe: 'gemini', status: 'reviewing' })];
    expect(planTick(snapshot(review, busy), NOW).unjudgeable).toEqual([]);
    // A judge on another model of the same family is enough under different_model.
    const other = [...sameModel, character('sable', { cls: 'judge', model: 'claude-opus-5-5' })];
    expect(planTick(snapshot(review, other), NOW)).toMatchObject({
      verifications: [{ quest: Q1, verifier: 'sable' }],
      unjudgeable: [],
    });
    // machine_only never waits for ever: the machine judges.
    const machineOnly = {
      kingdom: {
        ...KINGDOM,
        dispatch: { ...KINGDOM.dispatch, verifier_same_family: 'machine_only' as const },
      },
    };
    expect(planTick(snapshot(review, sameModel, machineOnly), NOW)).toMatchObject({
      machine_verdicts: [Q1],
      unjudgeable: [],
    });
  });

  it('sends an idle character on a fail streak to the Temple before it is given anything', () => {
    const streak = { fail_kind: 'tests_fail' as const, count: 3 };
    const characters = [
      character('thorn', { fails: streak }),
      character('kael', { fails: { ...streak, count: 2 } }),
      character('brann', { fails: streak, status: 'working' }),
    ];
    const plan = planTick(snapshot([returnedTo(quest(Q1), 'thorn'), quest(Q2)], characters), NOW);
    expect(plan).toMatchObject({
      suspensions: ['thorn'],
      redispatches: [],
      claims: [{ quest: Q2, assignee: 'kael' }],
    });
    // The one set aside counts no more for claimBlocker: it will be suspended.
    const alone = planTick(snapshot([quest(Q3)], [character('thorn', { fails: streak })]), NOW);
    expect(alone.unclaimable).toEqual([{ quest: Q3, reason: 'no_class' }]);
  });
});
