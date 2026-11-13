import { describe, expect, it } from 'vitest';

import { firstPassOf, runJudgementsOf } from './judgement.ts';
import { questOf, verdictOf } from './__fixtures__/ledger.ts';
import { passByRunOf } from './run-rates.ts';
import type { QuestTrail } from './rework.ts';

const trail = (quest: QuestTrail['quest'], verdicts: QuestTrail['verdicts'] = []): QuestTrail => ({
  quest,
  verdicts,
  trips: [],
});

/** Passed its third run, after a fail and a breaker. */
const THIRD = trail(
  questOf(1, [
    { n: 1, start: 0, end: 5 },
    { n: 1, role: 'verifier', start: 5, end: 6 },
    { n: 2, outcome: 'breaker', start: 10, end: 20 },
    { n: 3, start: 30, end: 35 },
    { n: 3, role: 'verifier', start: 35, end: 36 },
  ]),
  [verdictOf(1, 1, 'fail', { fail_kind: 'tests_fail', minute: 6 }), verdictOf(1, 3, 'pass', { minute: 36 })],
);

/** Passed its second run the next day, the mana having paused its first. */
const SECOND = trail(
  questOf(2, [
    { n: 1, outcome: 'paused', start: 0, end: 2 },
    { n: 1, start: 3, end: 5 },
    { n: 1, role: 'verifier', start: 5, end: 6 },
    { n: 2, start: 0, end: 5, day: '2026-11-09' },
    { n: 2, role: 'verifier', start: 5, end: 6, day: '2026-11-09' },
  ]),
  [
    verdictOf(2, 1, 'partial', { minute: 5 }),
    verdictOf(2, 1, 'fail', { fail_kind: 'incomplete', minute: 6 }),
    verdictOf(2, 2, 'pass', { minute: 1446 }),
  ],
);

/** Passed at once; then one still running, and a script. */
const FIRST = trail(questOf(3, [{ n: 1, start: 0, end: 5 }]), [verdictOf(3, 1, 'pass', { minute: 6 })]);
const RUNNING = trail(questOf(4, [{ n: 1, start: 0 }]));
const SCRIPT = trail(questOf(5, [{ n: 1, character: null, start: 0, end: 1 }], { tier: 'script' }));

describe('passByRunOf (PS-06b)', () => {
  it("judges each of a quest's runs, the first one as the first-pass rate does", () => {
    expect(runJudgementsOf(THIRD).map(({ n, passed }) => [n, passed])).toEqual([
      [1, false],
      [2, false],
      [3, true],
    ]);
    expect(runJudgementsOf(RUNNING)).toEqual([expect.objectContaining({ n: 1, passed: undefined })]);
    expect(runJudgementsOf(SCRIPT)).toEqual([]);
    expect([THIRD, SECOND, FIRST, RUNNING, SCRIPT].map(firstPassOf)).toEqual([
      false,
      false,
      true,
      undefined,
      undefined,
    ]);
  });

  it('rates each run over the quests whose run was decided', () => {
    expect(passByRunOf([THIRD, SECOND, FIRST, RUNNING, SCRIPT], {})).toEqual([
      { run: 1, decided: 3, passed: 1 },
      { run: 2, decided: 2, passed: 1 },
      { run: 3, decided: 1, passed: 1 },
    ]);
  });

  it('counts a run on the day it started, the rows before it at nought', () => {
    expect(passByRunOf([THIRD, SECOND], { since: '2026-11-09' })).toEqual([
      { run: 1, decided: 0, passed: 0 },
      { run: 2, decided: 1, passed: 1 },
    ]);
    expect(passByRunOf([], {})).toEqual([]);
  });
});
