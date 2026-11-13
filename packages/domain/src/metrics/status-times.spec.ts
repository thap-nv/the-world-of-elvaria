import { describe, expect, it } from 'vitest';

import { questViewOf } from '../world/quest-view.ts';
import { at, lineOf, questOf } from './__fixtures__/ledger.ts';
import { statusTimesOf } from './status-times.ts';
import type { QuestStatus } from '../schema/quest/shared.ts';

const QUEST = questOf(1, []);
const OTHER = questOf(2, []);

/** A quest line at minute `m` putting the quest in `status`, a judge holding it or not. */
const move = (type: string, m: number, status: QuestStatus, judge = false, quest = QUEST, day?: string) =>
  lineOf(
    type,
    { quest: { ...questViewOf(quest), status, verifier: judge ? 'vesper' : null } },
    at(m, day),
    quest.id,
  );

/**
 * Quest 1: open 10 minutes, working 20, review without a judge 4 then with one 6, awaiting the seal 60, then done
 * (still there). Quest 2: open 2 minutes, working 40, review without a judge 8 then with one 20, and the seal the
 * next day, 1370 minutes after the verdict.
 */
const LOG = [
  move('quest.created', 0, 'open'),
  move('quest.created', 0, 'open', false, OTHER),
  move('quest.claimed', 2, 'claimed', false, OTHER),
  move('quest.started', 2, 'working', false, OTHER),
  move('quest.edited', 5, 'open'),
  lineOf('quest.unclaimable', { reason: 'no_class', class: 'knight' }, at(6), QUEST.id),
  move('quest.claimed', 10, 'claimed'),
  move('quest.started', 10, 'working'),
  move('quest.submitted', 30, 'review'),
  move('quest.started', 34, 'review', true),
  move('quest.verdict', 40, 'awaiting_seal'),
  move('quest.submitted', 42, 'review', false, OTHER),
  move('quest.started', 50, 'review', true, OTHER),
  move('quest.sealed', 100, 'done'),
  move('quest.verdict', 70, 'awaiting_seal', false, OTHER),
  move('quest.sealed', 0, 'done', false, OTHER, '2026-11-09'),
  lineOf('check.end', { outcome: 'pass', checks: [] }, at(101), QUEST.id),
  lineOf('verdict.pass', {}, at(102), QUEST.id),
];

describe('statusTimesOf (PS-06b)', () => {
  it('gives each status the quests left, review split by whether a judge held it, the stay still open aside', () => {
    expect(statusTimesOf(LOG, {})).toEqual([
      { status: 'open', judge: null, stays: 2, median_minutes: 6, max_minutes: 10 },
      { status: 'claimed', judge: null, stays: 2, median_minutes: 0, max_minutes: 0 },
      { status: 'working', judge: null, stays: 2, median_minutes: 30, max_minutes: 40 },
      { status: 'review', judge: false, stays: 2, median_minutes: 6, max_minutes: 8 },
      { status: 'review', judge: true, stays: 2, median_minutes: 13, max_minutes: 20 },
      { status: 'awaiting_seal', judge: null, stays: 2, median_minutes: 715, max_minutes: 1370 },
    ]);
  });

  it('counts a stay on the day it ended', () => {
    expect(statusTimesOf(LOG, { since: '2026-11-09' })).toEqual([
      { status: 'awaiting_seal', judge: null, stays: 1, median_minutes: 1370, max_minutes: 1370 },
    ]);
    expect(statusTimesOf([], {})).toEqual([]);
  });
});
