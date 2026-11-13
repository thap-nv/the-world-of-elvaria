// A tribe's look is display only (ADR 0025, PS-24): who claims a quest and who judges it are the same whatever look
// the owner gives each tribe, even when two tribes swap looks.
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
} from '../dispatch/__fixtures__/snapshot.ts';
import { planTick } from '../dispatch/plan-tick.ts';
import type { TribeLookChoice } from '../schema/tribe-look.ts';

const SILVER_STAR = { palette: 'silver', crest: 'star', figure: 'slender', aura: 'glow', frame: 'round' };
const RED_FIRE = { palette: 'red', crest: 'fire', figure: 'sturdy', aura: 'sparks', frame: 'shield' };

/** Every tribe of the example kingdom with a look of the owner's: claude and gemini swap theirs. */
const LOOKS: Readonly<Record<string, TribeLookChoice>> = {
  claude: { ...RED_FIRE, name: 'Lửa Đỏ' },
  gemini: { ...SILVER_STAR, name: 'Sao Bạc' },
  codex: { palette: 'violet', crest: 'moon', figure: 'tall', aura: 'mist', frame: 'arch', name: 'Trăng Tím' },
};

const LOOKED = { ...KINGDOM, tribes: KINGDOM.tribes.map((tribe) => ({ ...tribe, look: LOOKS[tribe.id] })) };

describe('a tribe look never reaches dispatch', () => {
  it('leaves claims, judges and waits as they are when the tribes change looks', () => {
    const characters = [
      character('thorn'),
      character('kael', { tribe: 'gemini', model: 'gemini-3.8-flash-low' }),
      character('sable', { cls: 'judge', model: 'claude-opus-5-5', since: 0 }),
      character('orin', { cls: 'judge', tribe: 'gemini', since: 50 }),
    ];
    const quests = [quest(Q1), quest(Q2), inReview(quest(Q3), 'thorn'), inReview(quest(Q4), 'kael')];
    const plain = planTick(snapshot(quests, characters), NOW);
    const looked = planTick(snapshot(quests, characters, { kingdom: LOOKED }), NOW);
    expect(LOOKED.tribes.every(({ look }) => look !== undefined)).toBe(true);
    expect(plain.claims.length + plain.verifications.length).toBeGreaterThan(0);
    expect(looked).toEqual(plain);
  });
});
