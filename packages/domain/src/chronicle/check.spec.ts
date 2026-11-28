import { describe, expect, it } from 'vitest';

import { checkChronicle } from './check.ts';
import { CHRONICLE_TEXT_MAX } from './constants.ts';
import type { CharacterId, QuestId } from '../core/ids.ts';
import type { ChronicleLedger } from '../schema/chronicle/ledger.ts';

const mira = { id: 'mira' as CharacterId, name: 'Mira' };
const ivo = { id: 'ivo' as CharacterId, name: 'Ivo' };
const odd = { id: 'odd' as CharacterId, name: 'Ser (Odd)' };
const ROSTER = [mira, ivo, odd];
const Q = 'q_20261106_aaaaaa' as QuestId;

const LEDGER: ChronicleLedger = {
  version: 1,
  day: '2026-11-06',
  tz: 'UTC',
  entries: [
    { at: '2026-11-06T10:00:00Z', kind: 'quest_done', quest: Q, character: mira },
    { at: '2026-11-06T11:00:00Z', kind: 'pool_asleep', tribe: 'claude' as never, pool: 'claude' },
  ],
  counts: {
    quest_done: 1,
    quest_returned: 0,
    quest_sealed: 0,
    quest_infirmary: 0,
    quest_delivered: 0,
    quest_merged: 0,
    verdict_pass: 0,
    verdict_fail: 0,
    level_up: 0,
    level_down: 0,
    pool_asleep: 1,
    pool_awake: 0,
  },
  quests: 1,
  characters: [mira],
};

describe('checkChronicle', () => {
  it('passes a text that tells only what the ledger holds', () => {
    expect(checkChronicle(`Mira finished ${Q} before the claude pool slept.`, LEDGER, ROSTER)).toEqual([]);
  });

  it('catches a quest id the ledger does not hold, once however often it is named', () => {
    const text = `Mira closed q_20261106_zzzzzz and q_20261106_zzzzzz again, then ${Q}.`;
    expect(checkChronicle(text, LEDGER, ROSTER)).toEqual([
      { code: 'unknown_quest', quest: 'q_20261106_zzzzzz' },
    ]);
  });

  it('catches a character of the roster who did nothing that day', () => {
    expect(checkChronicle('Ivo and Mira toasted the day; so did Ser (Odd).', LEDGER, ROSTER)).toEqual([
      { code: 'idle_character', name: 'Ivo' },
      { code: 'idle_character', name: 'Ser (Odd)' },
    ]);
  });

  it('matches whole names only, in their case', () => {
    expect(checkChronicle('Ivory towers; ivo; Đivo; Ivo_s.', LEDGER, ROSTER)).toEqual([]);
  });

  it('bounds the length', () => {
    const text = 'a'.repeat(CHRONICLE_TEXT_MAX + 1);
    expect(checkChronicle(text, LEDGER, ROSTER)).toEqual([
      { code: 'too_long', length: CHRONICLE_TEXT_MAX + 1, max: CHRONICLE_TEXT_MAX },
    ]);
    expect(checkChronicle('a'.repeat(CHRONICLE_TEXT_MAX), LEDGER, ROSTER)).toEqual([]);
  });
});
