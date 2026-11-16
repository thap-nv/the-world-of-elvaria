// planTick and the owner's hold (fix/quest-hold): a held quest waits as one whose dependency is unfinished. Nobody
// claims it, its named character does not start it, the machine does not run it, and it is never named unclaimable.
import { describe, expect, it } from 'vitest';

import { holdQuest } from '../quest/hold.ts';
import { NOW, Q1, Q2, Q3, at, character, claimedBy, quest, snapshot } from './__fixtures__/snapshot.ts';
import { planTick } from './plan-tick.ts';
import type { Quest } from '../schema/quest/quest.ts';

const held = (base: Quest): Quest => {
  const result = holdQuest(base, { at: at(20), reason: 'next run' });
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
};

describe('planTick: a quest the owner holds', () => {
  it('claims the open quest beside it, never the held one', () => {
    const plan = planTick(snapshot([held(quest(Q1)), quest(Q2)], [character('thorn')]), NOW);
    expect(plan.claims.map(({ quest: id }) => id)).toEqual([Q2]);
    expect(plan.unclaimable).toEqual([]);
  });

  it('does not start a held quest its named character could start', () => {
    const quests = [held(claimedBy(quest(Q1), 'thorn')), claimedBy(quest(Q2), 'brann')];
    const plan = planTick(snapshot(quests, [character('thorn'), character('brann')]), NOW);
    expect(plan.starts).toEqual([Q2]);
  });

  it('does not run a held script-tier quest', () => {
    const quests = [held(quest(Q1, { script: true })), quest(Q3, { script: true })];
    expect(planTick(snapshot(quests, []), NOW).scripts).toEqual([Q3]);
  });

  it('never names a held quest unclaimable, though nobody could take it', () => {
    const plan = planTick(snapshot([held(quest(Q1, { cls: 'dwarf' }))], [character('thorn')]), NOW);
    expect(plan).toMatchObject({ claims: [], unclaimable: [] });
  });

  it('claims it again once the hold is lifted', () => {
    const plan = planTick(snapshot([quest(Q1)], [character('thorn')]), NOW);
    expect(plan.claims.map(({ quest: id }) => id)).toEqual([Q1]);
  });
});
