// (PS-12g) The attention items of the Temple: a character suspended for a fail streak that the Temple did not free, with
// the Monk's letters and the command that releases it; and one item for the repeated failures that wait while the Temple
// cannot run, that adds a Monk when none can run it, else says how to turn it on. Both can wait.
import { describe, expect, it } from 'vitest';

import { CAMPAIGNS, CHARACTERS, KINGDOM, TERRITORIES } from './__fixtures__/examples.ts';
import { attentionQueue } from './attention.ts';
import { worldStateOf } from './world-state.ts';
import type { Instant } from '../core/clock.ts';
import type { CharacterId, MemoId } from '../core/ids.ts';

const NOW = Date.parse('2026-11-19T08:00:00+07:00') as Instant;
const STATE = worldStateOf({
  kingdom: KINGDOM,
  territories: TERRITORIES,
  characters: CHARACTERS,
  quests: [],
  campaigns: CAMPAIGNS,
});
const KAEL = 'kael' as CharacterId;
const LETTER = 'm_20261119_aaaaaa' as MemoId;

describe('attentionQueue with what waits on the Temple (PS-12g)', () => {
  it('lists a character suspended for a fail streak, with its letters and the release command', () => {
    const streak_suspended = [
      { character: KAEL, fail_kind: 'tests_fail' as const, count: 3, letters: [LETTER] },
      { character: 'mira' as CharacterId, fail_kind: null, count: 3, letters: [] },
    ];
    expect(attentionQueue(STATE, NOW, { streak_suspended })).toEqual([
      {
        kind: 'character_suspended',
        group: 'can_wait',
        advice: 'read_letters_then_release',
        command: ['character', 'release', 'kael'],
        character: 'kael',
        fail_kind: 'tests_fail',
        count: 3,
        letters: [LETTER],
      },
      {
        kind: 'character_suspended',
        group: 'can_wait',
        advice: 'read_letters_then_release',
        command: ['character', 'release', 'mira'],
        character: 'mira',
        count: 3,
        letters: [],
      },
    ]);
  });

  it('adds a Monk of the given class when none can run the Temple, off or not', () => {
    const temple_waiting = { groups: 2, reasons: ['disabled', 'no_monk'] as const, class: 'monk' };
    expect(attentionQueue(STATE, NOW, { temple_waiting })).toEqual([
      {
        kind: 'temple_no_monk',
        group: 'can_wait',
        advice: 'add_monk',
        command: ['character', 'add', '<id>', '--class', 'monk', '--model', '<model>'],
        count: 2,
        temple_reasons: ['disabled', 'no_monk'],
        class: 'monk',
      },
    ]);
  });

  it('leaves the class for the owner to fill in when the registry has none of the Monk', () => {
    const temple_waiting = { groups: 1, reasons: ['no_monk'] as const, class: null };
    const [item] = attentionQueue(STATE, NOW, { temple_waiting });
    expect(item?.command).toEqual(['character', 'add', '<id>', '--class', '<class>', '--model', '<model>']);
  });

  it('says the Temple is off, with no command, when a Monk could run it', () => {
    const temple_waiting = { groups: 2, reasons: ['disabled'] as const, class: 'monk' };
    expect(attentionQueue(STATE, NOW, { temple_waiting })).toEqual([
      {
        kind: 'temple_off',
        group: 'can_wait',
        advice: 'enable_temple',
        command: [],
        count: 2,
        temple_reasons: ['disabled'],
        class: 'monk',
      },
    ]);
  });
});
