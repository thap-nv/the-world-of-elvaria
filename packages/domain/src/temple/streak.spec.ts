// (PS-12g) streakSuspendedOf: every character the Steward suspended for a fail streak and still suspended, the Temple's
// runs between notwithstanding; the owner's suspension is not one.
import { describe, expect, it } from 'vitest';

import { at, lineOf, questId } from '../metrics/__fixtures__/ledger.ts';
import { streakSuspendedOf, templeLogOf } from './due.ts';
import type { Event } from '../schema/event/event.ts';

const STEWARD: Event['actor'] = { kind: 'steward' };
const OWNER: Event['actor'] = { kind: 'user' };

const character = (type: string, id: string, status: string, actor: Event['actor'] = STEWARD): Event => ({
  ...lineOf(type, { character: { id, status } }, at(0)),
  actor,
});
const ran = lineOf(
  'temple.ran',
  { trigger: 'suspension', day: '2026-11-08', groups: 1, operations: 0, letters: 0, tokens: 0 },
  at(1),
);
/** A quest line that moved the character too: how the owner suspends one that holds a quest. */
const questLine = (id: string, status: string): Event =>
  lineOf('quest.returned', { quest: { id: questId(1) }, characters: [{ id, status }] }, at(2), questId(1));

describe('streakSuspendedOf (PS-12g)', () => {
  it('keeps a suspension of the Steward across a run of the Temple, which templeLogOf forgets', () => {
    const events = [character('character.suspend', 'kael', 'suspended'), ran];
    expect(streakSuspendedOf(events)).toEqual(['kael']);
    expect(templeLogOf(events).suspended).toEqual([]);
  });

  it('leaves out a suspension by the owner, and one a release ended', () => {
    const events = [
      character('character.suspend', 'kael', 'suspended'),
      character('character.release', 'kael', 'idle', OWNER),
      character('character.suspend', 'sable', 'suspended', OWNER),
      character('character.suspend', 'mira', 'suspended'),
      character('character.level_up', 'mira', 'suspended'),
    ];
    expect(streakSuspendedOf(events)).toEqual(['mira']);
  });

  it('does not count the owner suspending, on a quest line, a character a release freed', () => {
    const events = [
      character('character.suspend', 'kael', 'suspended'),
      character('character.release', 'kael', 'idle'),
      questLine('kael', 'suspended'),
    ];
    expect(streakSuspendedOf(events)).toEqual([]);
  });
});
