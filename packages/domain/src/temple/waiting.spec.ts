// (PS-12g) What waits on the Temple: templeWaitingOf (the repeated failures while it cannot run) and streakWaitsOf (the
// characters suspended for a fail streak, with the Monk's letters on their runs).
import { describe, expect, it } from 'vitest';

import { streakWaitsOf, templeWaitingOf } from './waiting.ts';
import type { CharacterId, ClassId, MemoId, QuestId } from '../core/ids.ts';
import type { StreakWaitSource, TempleWaitingSource } from './waiting.ts';

const CLASSES = [{ id: 'knight' }, { id: 'abbot', is_monk: true }, { id: 'monk', is_monk: true }];
const MONK = { class: 'monk' as ClassId, status: 'idle' as const };

const waiting = (over: Partial<TempleWaitingSource>): TempleWaitingSource => ({
  enabled: true,
  characters: [MONK],
  classes: CLASSES,
  groups: 2,
  ...over,
});

describe('templeWaitingOf (PS-12g)', () => {
  it('says the groups wait while the Temple is off, with a Monk', () => {
    expect(templeWaitingOf(waiting({ enabled: false }))).toEqual({
      groups: 2,
      reasons: ['disabled'],
      class: 'abbot',
    });
  });

  it('says so with no Monk, or only a suspended one, and both reasons when both hold', () => {
    const suspended = { ...MONK, status: 'suspended' as const };
    expect(templeWaitingOf(waiting({ characters: [suspended] }))?.reasons).toEqual(['no_monk']);
    expect(templeWaitingOf(waiting({ enabled: false, characters: [] }))?.reasons).toEqual([
      'disabled',
      'no_monk',
    ]);
  });

  it('names no class when the registry has none of the Monk', () => {
    expect(templeWaitingOf(waiting({ classes: [{ id: 'knight' }] }))).toEqual({
      groups: 2,
      reasons: ['no_monk'],
      class: null,
    });
  });

  it('says nothing without a repeated failure, or when the Temple can run', () => {
    expect(templeWaitingOf(waiting({ enabled: false, groups: 0 }))).toBeUndefined();
    expect(templeWaitingOf(waiting({}))).toBeUndefined();
  });
});

const KAEL = 'kael' as CharacterId;
const QUEST = 'q_20261119_aaaaaa' as QuestId;

const suspendedKnight = (id: string, count: number, kind?: 'tests_fail') =>
  ({
    id: id as CharacterId,
    class: 'knight' as ClassId,
    status: 'suspended',
    consecutive_fail: { count, ...(kind === undefined ? {} : { fail_kind: kind }) },
  }) satisfies StreakWaitSource['characters'][number];

const memo = (id: string, from: string | undefined, attempt: number, state: 'open' | 'closed' = 'open') => ({
  id: id as MemoId,
  quest: QUEST,
  attempt,
  state,
  ...(from === undefined ? {} : { from: from as CharacterId }),
});

const entry = (n: number, character: string, role: 'assignee' | 'verifier') => ({
  n,
  character: character as CharacterId,
  role,
});

describe('streakWaitsOf (PS-12g)', () => {
  it("lists those still suspended for a streak, by id, with the Monk's open letters on runs they worked", () => {
    const source: StreakWaitSource = {
      characters: [
        suspendedKnight('mira', 3, 'tests_fail'),
        suspendedKnight('kael', 3, 'tests_fail'),
        suspendedKnight('sable', 0),
        { ...MONK, id: 'sage' as CharacterId, consecutive_fail: { count: 0 } },
      ],
      classes: CLASSES,
      streak: [KAEL, 'mira' as CharacterId],
      memos: [
        memo('m_b', 'sage', 1),
        memo('m_a', 'sage', 1),
        memo('m_closed', 'sage', 1, 'closed'),
        memo('m_knight', 'mira', 1),
        memo('m_steward', undefined, 1),
        memo('m_judged', 'sage', 2),
        { ...memo('m_gone', 'sage', 1), quest: 'q_20261119_bbbbbb' as QuestId },
      ],
      quests: [{ id: QUEST, attempt_log: [entry(1, 'kael', 'assignee'), entry(2, 'kael', 'verifier')] }],
    };
    expect(streakWaitsOf(source)).toEqual([
      { character: 'kael', fail_kind: 'tests_fail', count: 3, letters: ['m_a', 'm_b'] },
      { character: 'mira', fail_kind: 'tests_fail', count: 3, letters: [] },
    ]);
  });

  it('gives no fail kind when the streak names none', () => {
    const source: StreakWaitSource = {
      characters: [suspendedKnight('kael', 3)],
      classes: CLASSES,
      streak: [KAEL],
      memos: [],
      quests: [],
    };
    expect(streakWaitsOf(source)).toEqual([{ character: 'kael', fail_kind: null, count: 3, letters: [] }]);
  });
});
