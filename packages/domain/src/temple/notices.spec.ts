// (PS-12g) templeNoticesOf: the digest's notices of the Temple from the files and the log, the same for the Steward's
// digest and `elvaria digest`.
import { describe, expect, it } from 'vitest';

import { at, lineOf } from '../metrics/__fixtures__/ledger.ts';
import { runsWorld } from '../metrics/__fixtures__/lessons.ts';
import { templeNoticesOf } from './notices.ts';
import type { RunRow } from '../metrics/__fixtures__/lessons.ts';
import type { Character } from '../schema/character/character.ts';
import type { TempleNoticeSource } from './notices.ts';

const CLASSES = [{ id: 'knight' }, { id: 'monk', is_monk: true }];
const THORN = {
  id: 'thorn',
  tribe: 'claude',
  class: 'knight',
  status: 'suspended',
  consecutive_fail: { fail_kind: 'tests_fail', count: 3 },
} as unknown as Character;
const SUSPENDED = lineOf('character.suspend', { character: { id: 'thorn', status: 'suspended' } }, at(0));

const fails = (kind: 'tests_fail' | 'style'): RunRow[] =>
  Array.from({ length: 3 }, () => ({ result: 'fail', fail_kind: kind }));

const sourceOf = (rows: readonly RunRow[]): TempleNoticeSource => {
  const world = runsWorld(rows);
  return {
    enabled: false,
    classes: CLASSES,
    characters: [THORN],
    quests: world.quests,
    verdicts: world.verdicts,
    memos: [],
    events: [...world.events, SUSPENDED],
  };
};

describe('templeNoticesOf (PS-12g)', () => {
  it('counts two groups of repeated failures for a Temple that is off and has no Monk, and the suspended', () => {
    expect(templeNoticesOf(sourceOf([...fails('tests_fail'), ...fails('style')]))).toEqual({
      streak_suspended: [{ character: 'thorn', fail_kind: 'tests_fail', count: 3, letters: [] }],
      temple_waiting: { groups: 2, reasons: ['disabled', 'no_monk'], class: 'monk' },
    });
  });

  it('says nothing waits on the Temple without a repeated failure', () => {
    expect(templeNoticesOf(sourceOf([{ result: 'pass' }, ...fails('style').slice(1)]))).toEqual({
      streak_suspended: [{ character: 'thorn', fail_kind: 'tests_fail', count: 3, letters: [] }],
    });
  });
});
