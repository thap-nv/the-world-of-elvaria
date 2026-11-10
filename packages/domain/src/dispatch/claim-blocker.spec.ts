import { describe, expect, it } from 'vitest';

import { Q1, Q2, Q3, character, quest } from './__fixtures__/snapshot.ts';
import { claimBlocker } from './claim-blocker.ts';
import type { CharacterId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';

const rankA = quest(Q1, { rank: 'A' });

describe('claimBlocker', () => {
  it('reports level_too_low when the highest knight is level 5 (ceiling C) for a rank-A quest', () => {
    const roster = [character('kael', { level: 2 }), character('thorn', { level: 5 })];
    expect(claimBlocker(rankA, roster)).toEqual({
      reason: 'level_too_low',
      best: { character: 'thorn', level: 5, ceiling: 'C' },
    });
  });

  it('reports nothing at level 7 (ceiling B): it takes A when nobody else can, with the seal', () => {
    expect(claimBlocker(rankA, [character('thorn', { level: 7 })])).toBeNull();
  });

  it('reports nothing for a level-9 knight, busy or asleep: that wait ends by itself', () => {
    expect(claimBlocker(rankA, [character('thorn', { level: 9, status: 'working' })])).toBeNull();
    expect(claimBlocker(rankA, [character('thorn', { level: 9, status: 'sleeping_mana' })])).toBeNull();
  });

  it('reports no_class when the roster has nobody of the class', () => {
    expect(claimBlocker(rankA, [])).toEqual({ reason: 'no_class' });
    expect(claimBlocker(rankA, [character('wren', { cls: 'scribe', level: 10 })])).toEqual({
      reason: 'no_class',
    });
  });

  it('names the same best character among equals: the lowest id', () => {
    const roster = [character('thorn', { level: 4 }), character('kael', { level: 4 })];
    expect(claimBlocker(rankA, roster)?.best?.character).toBe('kael');
  });
});

describe('claimBlocker in a party (P1-37 (ii))', () => {
  const tests: Quest = {
    ...quest(Q3, { party: Q1, dependsOn: [Q1] }),
    party_role: 'acceptance',
    assignee: 'thorn' as CharacterId,
  };
  const part = quest(Q2, { party: Q1, dependsOn: [Q1, Q3] });
  const contract = quest(Q1, { party: Q1, kind: 'plan', cls: 'mage', status: 'done' });

  it("reports party_bars when the party bars every knight: one knight wrote the blind trial's tests", () => {
    expect(claimBlocker(part, [character('thorn', { level: 9 })], [contract, tests])).toEqual({
      reason: 'party_bars',
    });
  });

  it('reports nothing once a knight the party does not bar is there, and no_class before the bars', () => {
    const roster = [character('thorn', { level: 9 }), character('kael', { level: 5 })];
    expect(claimBlocker(part, roster, [contract, tests])).toBeNull();
    expect(claimBlocker(part, [], [contract, tests])).toEqual({ reason: 'no_class' });
  });

  it('names the best knight the party does not bar when the level is too low', () => {
    const roster = [character('thorn', { level: 9 }), character('kael', { level: 2 })];
    expect(claimBlocker({ ...part, rank: 'A' }, roster, [contract, tests])).toEqual({
      reason: 'level_too_low',
      best: { character: 'kael', level: 2, ceiling: 'E' },
    });
  });
});
