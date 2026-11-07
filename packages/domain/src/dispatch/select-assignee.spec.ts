import { describe, expect, it } from 'vitest';

import { Q1, character, quest } from './__fixtures__/snapshot.ts';
import { selectAssignee } from './select-assignee.ts';
import type { Character } from '../schema/character/character.ts';

const chosen = (candidates: readonly Character[], spec: Parameters<typeof quest>[1] = {}) =>
  selectAssignee(quest(Q1, { tags: ['frontend', 'i18n'], ...spec }), candidates)?.id;

describe('selectAssignee', () => {
  it('takes only the required class', () => {
    expect(chosen([character('wren', { cls: 'scribe' })])).toBeUndefined();
    expect(chosen([character('wren', { cls: 'scribe' }), character('thorn')])).toBe('thorn');
  });

  it('prefers a character whose level takes the rank over one it would stretch, never two ranks', () => {
    // Rank C: level 4 takes it as a matter of course; level 3 (ceiling D) only when nobody else can.
    const both = [character('kael', { level: 3, since: 0 }), character('thorn', { level: 4, since: 30 })];
    expect(chosen(both, { rank: 'C' })).toBe('thorn');
    expect(chosen([character('kael', { level: 3 })], { rank: 'C' })).toBe('kael');
    expect(chosen([character('kael', { level: 3 })], { rank: 'B' })).toBeUndefined();
  });

  it("ranks by the pass rate on the quest's tags, a character without verdicts on them last", () => {
    const candidates = [
      character('ash', { since: 0 }),
      character('kael', { since: 10, affinity: { frontend: ['pass', 'fail'] } }),
      character('thorn', { since: 20, affinity: { frontend: ['pass'], i18n: ['pass', 'pass'] } }),
      character('brann', { since: 0, affinity: { db: ['pass'] } }),
    ];
    expect(chosen(candidates)).toBe('thorn');
    expect(chosen(candidates.slice(0, 2))).toBe('kael');
  });

  it('puts a character pinned to one of the tags first, whatever its rate', () => {
    const candidates = [
      character('thorn', { affinity: { frontend: ['pass'] } }),
      character('kael', { pinned: 'i18n', affinity: { frontend: ['fail'] } }),
      character('ash', { pinned: 'db' }),
    ];
    expect(chosen(candidates)).toBe('kael');
  });

  it('breaks a tie by who has been idle the longest, then by id', () => {
    expect(chosen([character('thorn', { since: 20 }), character('kael', { since: 5 })])).toBe('kael');
    expect(chosen([character('thorn', { since: 5 }), character('kael', { since: 5 })])).toBe('kael');
  });
});
