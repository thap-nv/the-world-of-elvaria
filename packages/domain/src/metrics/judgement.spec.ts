import { describe, expect, it } from 'vitest';

import { at, questOf, verdictOf } from './__fixtures__/ledger.ts';
import { escapedOf, firstPassOf, firstRunOf, sealedCostOf } from './judgement.ts';
import type { EntrySpec } from './__fixtures__/ledger.ts';
import type { Verdict } from '../schema/quest/verdict.ts';

const JUDGED: readonly EntrySpec[] = [
  { n: 1, outcome: 'submitted', start: 0, end: 5 },
  { n: 1, role: 'verifier', outcome: 'submitted', start: 5, end: 7 },
];

const passOf = (log: readonly EntrySpec[], verdicts: readonly Verdict[], tier?: 'script') =>
  firstPassOf({ quest: questOf(1, log, tier === undefined ? {} : { tier }), verdicts, trips: [] });

describe('firstPassOf', () => {
  it("passes a first run whose judgement holds a pass and no fail, the owner's seal beside it", () => {
    const seal = verdictOf(1, 1, 'pass', { owner: true, minute: 30 });
    expect(passOf(JUDGED, [verdictOf(1, 1, 'pass', { minute: 7 }), seal])).toBe(true);
  });

  it('fails a first run with a fail verdict, the owner overturning a pass included', () => {
    expect(passOf(JUDGED, [verdictOf(1, 1, 'fail', { fail_kind: 'style', minute: 7 })])).toBe(false);
    const returned = verdictOf(1, 1, 'fail', { owner: true, fail_kind: 'style', minute: 20 });
    expect(passOf(JUDGED, [verdictOf(1, 1, 'pass', { minute: 7 }), returned])).toBe(false);
  });

  it('fails a first run that ended without a verdict when another run followed', () => {
    const log: EntrySpec[] = [
      { n: 1, outcome: 'breaker', start: 0, end: 6 },
      { n: 2, outcome: 'submitted', start: 10, end: 13 },
    ];
    expect(passOf(log, [verdictOf(1, 2, 'pass', { minute: 15 })])).toBe(false);
  });

  it('leaves undecided a first run still judged, and a quest no character worked', () => {
    expect(passOf(JUDGED, [verdictOf(1, 1, 'partial', { minute: 7 })])).toBeUndefined();
    const script: EntrySpec[] = [{ n: 1, character: null, outcome: 'submitted', start: 0, end: 1 }];
    expect(passOf(script, [verdictOf(1, 1, 'pass', { machine: true, minute: 1 })], 'script')).toBeUndefined();
  });

  it('starts from the first counted assignee session, after a pause', () => {
    const quest = questOf(1, [
      { n: 1, outcome: 'paused', start: 0, end: 5, session: 'a' },
      { n: 1, outcome: 'submitted', start: 300, end: 305, session: 'b' },
    ]);
    expect(firstRunOf(quest)?.session_id).toBe('b');
  });
});

describe('escapedOf', () => {
  it('lists the runs a judge or the machine passed and the owner returned', () => {
    const verdicts = [
      verdictOf(1, 1, 'pass', { minute: 7 }),
      verdictOf(1, 1, 'fail', { owner: true, rejudge: true, fail_kind: 'wrong_facts', minute: 20 }),
      verdictOf(1, 2, 'pass', { machine: true, minute: 40 }),
      verdictOf(1, 2, 'fail', { owner: true, minute: 50 }),
      // A run the judge failed too: the owner's return lets nothing through.
      verdictOf(1, 3, 'fail', { fail_kind: 'style', minute: 60 }),
      verdictOf(1, 3, 'fail', { owner: true, fail_kind: 'style', minute: 70 }),
    ];
    expect(escapedOf({ quest: questOf(1, JUDGED), verdicts, trips: [] })).toEqual([
      { quest: questOf(1, []).id, n: 1, at: at(20), fail_kind: 'wrong_facts', rejudge: true },
      { quest: questOf(1, []).id, n: 2, at: at(50), fail_kind: null, rejudge: false },
    ]);
  });
});

describe('sealedCostOf', () => {
  it('adds the tokens of every session and measures the span and the sessions apart', () => {
    const quest = questOf(
      1,
      [
        { n: 1, outcome: 'paused', start: 0, end: 5, tokens: 100 },
        { n: 1, outcome: 'submitted', start: 300, end: 306, tokens: 50 },
        { n: 1, role: 'verifier', outcome: 'submitted', start: 306, end: 310 },
        { n: 2, start: 400 },
      ],
      { sealed: 420 },
    );
    expect(sealedCostOf(quest)).toEqual({
      quest: quest.id,
      sealed_at: at(420),
      tokens: 150,
      span_minutes: 310,
      session_minutes: 15,
    });
  });

  it('measures nothing of a sealed quest without a finished session, and skips an unsealed one', () => {
    expect(sealedCostOf(questOf(1, [], { sealed: 10 }))).toMatchObject({
      tokens: 0,
      span_minutes: 0,
      session_minutes: 0,
    });
    expect(sealedCostOf(questOf(1, JUDGED))).toBeUndefined();
  });
});
