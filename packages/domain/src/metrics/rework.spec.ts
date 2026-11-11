import { describe, expect, it } from 'vitest';

import { at, questOf, verdictOf } from './__fixtures__/ledger.ts';
import { lastFailOf, reworkOf } from './rework.ts';
import type { QuestTrail, TripAt } from './rework.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Verdict } from '../schema/quest/verdict.ts';

const trail = (
  quest: Quest,
  verdicts: readonly Verdict[] = [],
  trips: readonly TripAt[] = [],
): QuestTrail => ({
  quest,
  verdicts,
  trips,
});

/** Each rework session as `role n: cause by value`. */
const causes = (subject: QuestTrail): string[] =>
  reworkOf(subject).map(
    ({ role, n, cause, by, value }) => `${role} ${n}: ${cause} by ${by} ${String(value)}`,
  );

describe('reworkOf', () => {
  it('counts nothing beyond one assignee and one verifier', () => {
    const quest = questOf(1, [
      { n: 1, outcome: 'submitted', start: 0, end: 5 },
      { n: 1, role: 'verifier', outcome: 'submitted', start: 5, end: 9 },
    ]);
    expect(reworkOf(trail(quest, [verdictOf(1, 1, 'pass', { minute: 9 })]))).toEqual([]);
  });

  it('gives a redone run, assignee and verifier both, the fail kind of the verdict before it', () => {
    const quest = questOf(1, [
      { n: 1, outcome: 'submitted', start: 0, end: 5 },
      { n: 1, role: 'verifier', outcome: 'submitted', start: 5, end: 9 },
      { n: 2, outcome: 'submitted', start: 10, end: 12 },
      { n: 2, role: 'verifier', outcome: 'submitted', start: 12, end: 14 },
    ]);
    const verdicts = [
      verdictOf(1, 1, 'fail', { fail_kind: 'style', minute: 9 }),
      verdictOf(1, 2, 'pass', { minute: 14 }),
    ];
    expect(reworkOf(trail(quest, verdicts))).toEqual([
      {
        quest: quest.id,
        n: 2,
        role: 'assignee',
        character: 'thorn',
        started_at: at(10),
        cause: 'output',
        by: 'fail_kind',
        value: 'style',
      },
      expect.objectContaining({ role: 'verifier', n: 2, cause: 'output', value: 'style' }),
    ]);
  });

  it('blames the machinery for a judge a breaker cut, and for an assignee the breaker stopped', () => {
    const judged = questOf(2, [
      { n: 1, outcome: 'submitted', start: 0, end: 3 },
      { n: 1, role: 'verifier', outcome: 'breaker', start: 3, end: 4 },
      { n: 1, role: 'verifier', outcome: 'partial', start: 4, end: 5 },
      { n: 1, role: 'verifier', outcome: 'submitted', start: 5, end: 7 },
    ]);
    expect(causes(trail(judged))).toEqual([
      'verifier 1: infra by outcome breaker',
      'verifier 1: infra by outcome partial',
    ]);
    const stopped = questOf(3, [
      { n: 1, outcome: 'breaker', start: 0, end: 6 },
      { n: 2, outcome: 'submitted', start: 10, end: 13 },
      { n: 2, role: 'verifier', outcome: 'submitted', start: 13, end: 15 },
    ]);
    expect(causes(trail(stopped))).toEqual(['assignee 2: infra by outcome breaker']);
  });

  it('counts the session after a question as a question, and the redone run after a fail as output', () => {
    const asked = questOf(5, [
      { n: 1, outcome: 'submitted', start: 0, end: 8 },
      { n: 1, role: 'verifier', outcome: 'submitted', start: 8, end: 10 },
      { n: 2, outcome: 'blocked', start: 11, end: 12 },
      { n: 2, outcome: 'submitted', start: 13, end: 15 },
      { n: 2, role: 'verifier', outcome: 'submitted', start: 15, end: 18 },
    ]);
    expect(causes(trail(asked, [verdictOf(5, 1, 'fail', { fail_kind: 'tests_fail', minute: 10 })]))).toEqual([
      'assignee 2: output by fail_kind tests_fail',
      'assignee 2: question by outcome blocked',
      'verifier 2: output by fail_kind tests_fail',
    ]);
  });

  it("leaves out the machine's runs and the sessions the mana paused", () => {
    const script = questOf(6, [{ n: 1, character: null, outcome: 'submitted', start: 0, end: 1 }], {
      tier: 'script',
    });
    const paused = questOf(7, [
      { n: 1, outcome: 'paused', start: 0, end: 5 },
      { n: 1, outcome: 'submitted', start: 300, end: 305 },
      { n: 1, role: 'verifier', outcome: 'submitted', start: 305, end: 307 },
    ]);
    expect(reworkOf(trail(script))).toEqual([]);
    expect(reworkOf(trail(paused))).toEqual([]);
  });

  it("reads the owner's return, a rejudge too, as the run's fail", () => {
    const rejudged = questOf(8, [
      { n: 1, outcome: 'submitted', start: 0, end: 5 },
      { n: 1, role: 'verifier', outcome: 'submitted', start: 5, end: 7 },
      { n: 1, role: 'verifier', character: 'ilse', outcome: 'submitted', start: 30, end: 33 },
    ]);
    const verdicts = [
      verdictOf(8, 1, 'pass', { minute: 7 }),
      verdictOf(8, 1, 'fail', { owner: true, rejudge: true, fail_kind: 'wrong_facts', minute: 20 }),
    ];
    expect(causes(trail(rejudged, verdicts))).toEqual(['verifier 1: output by fail_kind wrong_facts']);
  });

  it('takes a flaky check for the machinery, and a fail without a kind for other', () => {
    const log = [
      { n: 1, outcome: 'submitted', start: 0, end: 5 },
      { n: 2, outcome: 'submitted', start: 10, end: 12 },
    ] as const;
    const flaky = verdictOf(1, 1, 'fail', { machine: true, fail_kind: 'flaky', minute: 6 });
    expect(causes(trail(questOf(1, log), [flaky]))).toEqual(['assignee 2: infra by fail_kind flaky']);
    const kindless = verdictOf(1, 1, 'fail', { machine: true, minute: 6 });
    expect(causes(trail(questOf(1, log), [kindless]))).toEqual(['assignee 2: output by fail_kind other']);
  });

  it('reads an infirmary trip between a handed-in run and the next', () => {
    const quest = questOf(9, [
      { n: 1, outcome: 'submitted', start: 0, end: 5 },
      { n: 2, outcome: 'submitted', start: 20, end: 25 },
    ]);
    const trips: TripAt[] = [
      { at: at(6), trip: 'commit' },
      { at: at(7), trip: 'max_attempts' },
    ];
    expect(causes(trail(quest, [], trips))).toEqual(['assignee 2: infra by trip commit']);
    const outside: TripAt[] = [
      { at: at(0, '2026-11-07'), trip: 'forbidden_paths' },
      { at: at(30), trip: 'forbidden_paths' },
      { at: at(8), trip: 'max_attempts' },
    ];
    expect(causes(trail(quest, [], outside))).toEqual(['assignee 2: unknown by none null']);
  });

  it('says unknown when the files tell nothing: an open session, a log whose runs go backwards', () => {
    const open = questOf(1, [
      { n: 1, start: 0 },
      { n: 1, outcome: 'submitted', start: 10, end: 12 },
    ]);
    expect(causes(trail(open))).toEqual(['assignee 1: unknown by none null']);
    const backwards = questOf(2, [
      { n: 2, outcome: 'submitted', start: 0, end: 5 },
      { n: 2, role: 'verifier', outcome: 'submitted', start: 5, end: 7 },
      { n: 1, role: 'verifier', outcome: 'submitted', start: 8, end: 9 },
    ]);
    expect(causes(trail(backwards))).toEqual(['verifier 1: unknown by none null']);
  });
});

describe('lastFailOf', () => {
  it("takes the run's latest fail, whatever the order of the files", () => {
    const owner = verdictOf(1, 1, 'fail', { owner: true, fail_kind: 'style', minute: 40 });
    const judge = verdictOf(1, 1, 'fail', { fail_kind: 'tests_fail', minute: 10 });
    expect(lastFailOf([owner, judge, verdictOf(1, 2, 'fail', { minute: 50 })], 1)).toBe(owner);
    expect(lastFailOf([verdictOf(1, 1, 'pass', { minute: 10 })], 1)).toBeUndefined();
  });
});
