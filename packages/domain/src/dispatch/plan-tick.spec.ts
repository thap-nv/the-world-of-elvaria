import { describe, expect, it } from 'vitest';

import { transition } from '../quest/transition.ts';
import { NOW, Q1, Q2, Q3, at, character, quest, snapshot } from './__fixtures__/snapshot.ts';
import { planTick } from './plan-tick.ts';
import type { TribeId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { KingdomSnapshot } from './plan-tick.ts';

const claimsOf = (state: KingdomSnapshot) => planTick(state, NOW).claims;
const takers = (quests: readonly Quest[], characters: readonly Character[]) =>
  claimsOf(snapshot(quests, characters)).map(({ quest: id, assignee }) => [id, assignee]);

describe('planTick: who takes an open quest', () => {
  it('gives each open quest to a free character of the class it requires', () => {
    const quests = [quest(Q1), quest(Q2, { cls: 'dwarf' })];
    const characters = [
      character('wren', { cls: 'scribe' }),
      character('thorn'),
      character('brann', { cls: 'dwarf' }),
    ];
    expect(claimsOf(snapshot(quests, characters))).toEqual([
      { quest: Q1, assignee: 'thorn', level: 3 },
      { quest: Q2, assignee: 'brann', level: 3 },
    ]);
  });

  it('claims nothing when nobody of the class is free', () => {
    const busy = ['working', 'suspended', 'sleeping_mana'] as const;
    const characters = [
      character('wren', { cls: 'scribe' }),
      ...busy.map((status, index) => character(`knight-${index}`, { status })),
    ];
    expect(takers([quest(Q1)], characters)).toEqual([]);
  });

  it('prefers a character whose level takes the rank over one it would stretch', () => {
    // Rank C: level 4 takes it as a matter of course; level 3 (ceiling D) only when nobody else can.
    const characters = [
      character('kael', { level: 3, since: 0 }),
      character('thorn', { level: 4, since: 30 }),
    ];
    expect(takers([quest(Q1, { rank: 'C' })], characters)).toEqual([[Q1, 'thorn']]);
  });

  it('stretches one rank above the ceiling when nobody else of the class can take it, never two', () => {
    expect(takers([quest(Q1, { rank: 'C' })], [character('kael', { level: 3 })])).toEqual([[Q1, 'kael']]);
    expect(takers([quest(Q1, { rank: 'B' })], [character('kael', { level: 3 })])).toEqual([]);
  });

  it('gives the quest to the character idle the longest, then by id', () => {
    const longer = [character('thorn', { since: 20 }), character('kael', { since: 5 })];
    expect(takers([quest(Q1)], longer)).toEqual([[Q1, 'kael']]);
    const tied = [character('thorn', { since: 5 }), character('kael', { since: 5 })];
    expect(takers([quest(Q1)], tied)).toEqual([[Q1, 'kael']]);
  });
});

describe('planTick: tribes', () => {
  it('leaves out characters of a disabled tribe', () => {
    expect(takers([quest(Q1)], [character('vex', { tribe: 'codex' })])).toEqual([]);
  });

  it('leaves out characters of a tribe with a sleeping pool, not those of other tribes', () => {
    const characters = [character('thorn'), character('wren', { cls: 'scribe', tribe: 'gemini' })];
    const quests = [quest(Q1), quest(Q2, { cls: 'scribe' })];
    const geminiAsleep = { asleep: [{ tribe: 'gemini' as TribeId, pool: 'gemini_models' }] };
    expect(claimsOf(snapshot(quests, characters, geminiAsleep)).map(({ assignee }) => assignee)).toEqual([
      'thorn',
    ]);
  });
});

describe('planTick: order and limits', () => {
  it('gives a free character one quest per tick: highest rank first, then the oldest, then by id', () => {
    const thorn = [character('thorn', { level: 6 })];
    expect(takers([quest(Q1, { rank: 'D' }), quest(Q2, { rank: 'B' })], thorn)).toEqual([[Q2, 'thorn']]);
    expect(takers([quest(Q1, { created: 9 }), quest(Q2, { created: 3 })], thorn)).toEqual([[Q2, 'thorn']]);
    expect(takers([quest(Q2), quest(Q1)], thorn)).toEqual([[Q1, 'thorn']]);
  });

  it('waits until every quest a quest depends on is done', () => {
    const thorn = [character('thorn')];
    const waiting = [quest(Q1, { dependsOn: [Q2] }), quest(Q2, { status: 'draft' })];
    expect(takers(waiting, thorn)).toEqual([]);
    expect(takers([quest(Q1, { dependsOn: [Q3] })], thorn)).toEqual([]);
    const ready = [quest(Q1, { dependsOn: [Q2] }), quest(Q2, { status: 'done' })];
    expect(takers(ready, thorn)).toEqual([[Q1, 'thorn']]);
  });

  it('hands script-tier quests to the Steward, with no character, and ignores quests that are not open', () => {
    const quests = [
      quest(Q1, { script: true }),
      quest(Q2, { status: 'draft' }),
      quest(Q3, { script: true, rank: 'B' }),
    ];
    expect(planTick(snapshot(quests, [character('thorn')]), NOW)).toEqual({ claims: [], scripts: [Q3, Q1] });
  });
});

describe('planTick and transition()', () => {
  it('plans claims the state machine accepts, a stretched one waiting for the seal', () => {
    const quests = [quest(Q1, { rank: 'C' }), quest(Q2, { rank: 'C', cls: 'dwarf' })];
    const characters = [character('kael', { level: 4 }), character('brann', { cls: 'dwarf', level: 3 })];
    const claimed = claimsOf(snapshot(quests, characters)).map(({ quest: id, assignee, level }) => {
      const before = quests.find((candidate) => candidate.id === id)!;
      return transition(before, { type: 'claim', at: at(120), assignee, level }, 'steward');
    });
    expect(claimed).toMatchObject([
      { ok: true, value: { status: 'claimed', assignee: 'kael', seal_required: false } },
      { ok: true, value: { status: 'claimed', assignee: 'brann', seal_required: true } },
    ]);
  });
});
