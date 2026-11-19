// staminaOf and its bar (PS-28, docs/plans/session-stamina.md "Định nghĩa thanh"): the gauge nearest its cut, empty
// exactly where evaluateBreakers cuts, with the reminder mark for an assignee only; and when the Steward writes a line.
import { describe, expect, it } from 'vitest';

import { MS_PER_MINUTE } from '../constants.ts';
import { evaluateBreakers } from './evaluate.ts';
import { barOf, staminaMoved, staminaOf } from './stamina.ts';
import type { Instant } from '../core/clock.ts';
import type { StaminaMark } from './stamina.ts';

const START = Date.parse('2026-11-17T17:30:00+07:00') as Instant;
const after = (minutes: number): Instant => (START + minutes * MS_PER_MINUTE) as Instant;
const attempt = { started_at: START };
const LIMITS = { max_minutes: 45, max_tokens: 120_000, max_turns: 200 };
/** 85 and 150: the reminder mark sits where 100 − 85 × 100 / 150 is left. */
const MARK = 43.333_333;

describe('staminaOf', () => {
  it('follows the gauge with the most of its ceiling used', () => {
    expect(staminaOf(attempt, LIMITS, after(9), { tokens: 60_000 })).toMatchObject({
      measure: 'tokens',
      pct: 50,
      notch: 3,
      zone: 'ok',
    });
    expect(staminaOf(attempt, LIMITS, after(36), { tokens: 60_000 })).toMatchObject({
      measure: 'time',
      used: 36,
      limit: 45,
      pct: 80,
    });
    expect(staminaOf(attempt, LIMITS, after(1), { tokens: 10, turns: 180 })).toMatchObject({
      measure: 'turns',
      pct: 90,
    });
  });

  it('takes time, then tokens, then turns when two gauges are as near their cut', () => {
    expect(staminaOf(attempt, LIMITS, after(27), { tokens: 72_000, turns: 120 }).measure).toBe('time');
    expect(staminaOf(attempt, LIMITS, after(1), { tokens: 72_000, turns: 120 }).measure).toBe('tokens');
    expect(staminaOf(attempt, LIMITS, after(80), { tokens: 999_999 }).measure).toBe('time');
  });

  it('is empty exactly when the breakers cut, save a token or turn count equal to the hard ceiling', () => {
    const cases = [
      { now: after(67.49), usage: { tokens: 0 } },
      { now: after(67.5), usage: { tokens: 0 } },
      { now: after(90), usage: { tokens: 0 } },
      { now: after(1), usage: { tokens: 179_999 } },
      { now: after(1), usage: { tokens: 180_001 } },
      { now: after(1), usage: { tokens: 0, turns: 299 } },
      { now: after(1), usage: { tokens: 0, turns: 301 } },
    ];
    for (const { now, usage } of cases) {
      const verdict = evaluateBreakers(attempt, LIMITS, now, usage);
      const cut = verdict !== 'ok' && 'trip' in verdict;
      expect(staminaOf(attempt, LIMITS, now, usage).left_pct === 0).toBe(cut);
    }
    const onTheCeiling = staminaOf(attempt, LIMITS, after(1), { tokens: 180_000 });
    expect(evaluateBreakers(attempt, LIMITS, after(1), { tokens: 180_000 })).not.toMatchObject({
      trip: 'tokens',
    });
    expect(onTheCeiling).toMatchObject({ left_pct: 0, notch: 10, zone: 'critical' });
    expect(evaluateBreakers(attempt, LIMITS, after(1), { tokens: 0, turns: 300 })).toMatchObject({
      kind: 'wrap_up',
    });
    expect(staminaOf(attempt, LIMITS, after(1), { tokens: 0, turns: 300 }).left_pct).toBe(0);
  });

  it('measures only minutes for a tribe without usage', () => {
    const bar = staminaOf(attempt, LIMITS, after(9), { tokens: 999_999, turns: 999 }, 'minutes_only');
    expect(bar).toMatchObject({ measure: 'time', used: 9, pct: 20, notch: 1 });
  });

  it('gives a judge no reminder mark and no yellow zone, only the red one near the cut', () => {
    const judge = (tokens: number) =>
      staminaOf(attempt, LIMITS, after(1), { tokens }, 'tokens_and_minutes', 'verifier');
    expect(judge(143_999)).toMatchObject({ zone: 'ok', mark_left_pct: undefined, role: 'verifier' });
    expect(judge(144_000)).toMatchObject({ zone: 'critical', left_pct: 20 });
  });

  it("marks an assignee's reminder and turns yellow past it, red with a fifth left", () => {
    const bar = (tokens: number) => staminaOf(attempt, LIMITS, after(1), { tokens });
    expect(bar(102_000)).toMatchObject({ zone: 'ok', soft_pct: 85, hard_pct: 150 });
    expect(bar(102_000).mark_left_pct).toBeCloseTo(MARK, 5);
    expect(bar(102_001).zone).toBe('wrap_up');
    expect(bar(143_999).zone).toBe('wrap_up');
    expect(bar(144_000)).toMatchObject({ zone: 'critical', left_pct: 20, notch: 8 });
  });

  it('fills up again when the ceiling is raised', () => {
    const before = staminaOf(attempt, LIMITS, after(1), { tokens: 150_000 });
    const raised = staminaOf(attempt, { ...LIMITS, max_tokens: 200_000 }, after(1), { tokens: 150_000 });
    expect(before).toMatchObject({ notch: 8, zone: 'critical' });
    expect(before.left_pct).toBeCloseTo(16.667, 3);
    expect(raised).toMatchObject({ left_pct: 50, notch: 5, zone: 'ok', limit: 200_000 });
  });

  it('puts the mark and the notches where thresholds other than the defaults say', () => {
    const limits = { ...LIMITS, soft_pct: 50, hard_pct: 200 };
    expect(staminaOf(attempt, limits, after(1), { tokens: 120_000 })).toMatchObject({
      pct: 100,
      left_pct: 50,
      notch: 5,
      mark_left_pct: 75,
      zone: 'wrap_up',
    });
    expect(staminaOf(attempt, LIMITS, after(1), { tokens: 120_000 }).notch).toBe(6);
    // A reminder set past the cut never comes: the mark sits at the empty end.
    const late = staminaOf(attempt, { ...LIMITS, soft_pct: 200 }, START, { tokens: 0 });
    expect(late).toMatchObject({ mark_left_pct: 0, left_pct: 100, notch: 0 });
  });

  it('never reads more than full when the clock runs behind the session', () => {
    expect(staminaOf(attempt, LIMITS, after(-5), { tokens: 0 })).toMatchObject({ left_pct: 100, notch: 0 });
  });
});

describe('the three sessions of run (J)', () => {
  // Quill (gemini), q_20261117_m8d5t2 run 1: a ceiling of 300 060 tokens in force, so a cut at 450 090.
  const J = { ...LIMITS, max_tokens: 300_060 };
  const at = (tokens: number) => staminaOf(attempt, J, after(10), { tokens });

  it.each([
    { tokens: 256_060, pct: 85.3363, left: 43.1092, notch: 5 },
    { tokens: 262_433, pct: 87.4602, left: 41.6932, notch: 5 },
    { tokens: 304_713, pct: 101.5507, left: 32.2995, notch: 6 },
  ])('past the reminder at $tokens tokens: $left % left, notch $notch', ({ tokens, pct, left, notch }) => {
    const bar = at(tokens);
    expect(bar).toMatchObject({ measure: 'tokens', limit: 300_060, notch, zone: 'wrap_up' });
    expect(bar.pct).toBeCloseTo(pct, 3);
    expect(bar.left_pct).toBeCloseTo(left, 3);
  });

  it('empties the first two at their cut, and leaves about 1 % to the third, which handed in its work', () => {
    expect(at(462_564)).toMatchObject({ left_pct: 0, notch: 10, zone: 'critical' });
    expect(at(495_826)).toMatchObject({ left_pct: 0, notch: 10, zone: 'critical' });
    const third = at(444_882);
    expect(third).toMatchObject({ notch: 9, zone: 'critical' });
    expect(third.left_pct).toBeCloseTo(1.1571, 3);
  });
});

describe('barOf', () => {
  it('reads one gauge of a line, the thresholds on it', () => {
    expect(
      barOf({ measure: 'time', used: 40.5, limit: 45, soft_pct: 85, hard_pct: 150, role: 'verifier' }),
    ).toEqual({
      measure: 'time',
      used: 40.5,
      limit: 45,
      soft_pct: 85,
      hard_pct: 150,
      role: 'verifier',
      pct: 90,
      left_pct: 40,
      notch: 6,
      mark_left_pct: undefined,
      zone: 'ok',
    });
  });
});

describe('staminaMoved', () => {
  const bar = (notch: number, measure: StaminaMark['measure'] = 'tokens', limit = 480_000): StaminaMark => ({
    notch,
    measure,
    limit,
  });
  const last = bar(3);

  it('writes nothing below the first notch, then once a notch is reached', () => {
    expect(staminaMoved(undefined, bar(0))).toBe(false);
    expect(staminaMoved(undefined, bar(1))).toBe(true);
    expect(staminaMoved(undefined, bar(7))).toBe(true);
  });

  it('writes when the notch moves, up or down, however far', () => {
    expect(staminaMoved(last, bar(3))).toBe(false);
    expect(staminaMoved(last, bar(4))).toBe(true);
    expect(staminaMoved(last, bar(10))).toBe(true);
    expect(staminaMoved(last, bar(1))).toBe(true);
  });

  it("writes when the same gauge's ceiling changes, not when the bar switches gauges within a notch", () => {
    expect(staminaMoved(last, bar(3, 'tokens', 600_000))).toBe(true);
    expect(staminaMoved(last, bar(3, 'time', 45))).toBe(false);
  });
});
