// What one session takes of a window, and the gauge closing one session before the cap (P1-48, P1-22 (b)).
import { describe, expect, it } from 'vitest';

import { SESSION_SHARE_DEFAULT_PCT } from './constants.ts';
import {
  endedSessionsOf,
  sessionShareOf,
  shareAheadOf,
  sharesOfHistory,
  withSessionShare,
} from './session-share.ts';
import { manaStateOf } from './state.ts';
import type { Instant } from '../core/clock.ts';
import type { CharacterId, TribeId } from '../core/ids.ts';
import type { Attempt } from '../schema/quest/quest-parts.ts';
import type { ManaReading } from './reading.ts';
import type { EndedSession, SessionShare } from './session-share.ts';

const GEMINI = 'gemini' as TribeId;
const TRIBES = [{ id: GEMINI, pools: { gemini_models: { enabled: true } } }];
const CFG = { cap_pct: 98, king_reserve_pct: 2, warn_margin_pct: 10 };
const at = (hour: number): string => `2026-11-07T${String(hour).padStart(2, '0')}:00:00+07:00`;
const instant = (hour: number): Instant => Date.parse(at(hour)) as Instant;
const ARGON = 'gemini-4-argon-medium';
const FLASH = 'gemini-3.8-flash-high';

/** Argon's weekly cap, read at `hour`. */
const argon = (used: number | null, hour: number, more: Partial<ManaReading> = {}): ManaReading => ({
  tribe: GEMINI,
  pool: 'gemini_models',
  model: 'argon',
  window: 'weekly',
  used_pct: used,
  resets_at: at(20),
  source: 'rate_limits',
  observed_at: at(hour),
  exhausted: false,
  ...more,
});
const ended = (hour: number, model = ARGON): EndedSession => ({ at: instant(hour), tribe: GEMINI, model });

describe('endedSessionsOf', () => {
  const entry = (character: string | null, endedAt?: string): Attempt => {
    const attempt: Attempt = {
      n: 1,
      character: character as CharacterId | null,
      role: 'assignee',
      started_at: at(8),
      run_dir: '.runs/q-1',
    };
    return endedAt === undefined ? attempt : { ...attempt, ended_at: endedAt };
  };
  const characters = [{ id: 'ilse' as CharacterId, tribe: GEMINI, model: ARGON }];

  it("keeps a character's sessions that ended, on its model now", () => {
    const log = [entry('ilse', at(9)), entry('ilse'), entry(null, at(9)), entry('ghost', at(9))];
    expect(endedSessionsOf([{ attempt_log: [...log, entry('ilse', 'soon')] }], characters)).toEqual([
      ended(9),
    ]);
  });
});

describe('sessionShareOf', () => {
  it('is the rise over the sessions the gauge binds that ended between the two readings', () => {
    expect(sessionShareOf(argon(80, 9), argon(87, 11), [ended(10)], TRIBES)).toBe(7);
    // Ended after the first reading and by the second; an Argon cap counts Argon sessions only.
    const two = [ended(10), ended(11), ended(9), ended(12), ended(10, FLASH)];
    expect(sessionShareOf(argon(80, 9), argon(93, 11), two, TRIBES)).toBe(6.5);
    // A rise that fell back (another window, an owner's reset) counts as nothing, not as a gain.
    expect(sessionShareOf(argon(80, 9), argon(70, 11), [ended(10)], TRIBES)).toBe(0);
  });

  it('counts the models the account lists in a group, when it lists them', () => {
    const group = (used: number, hour: number): ManaReading => {
      const { model: _cap, ...pool } = argon(used, hour, { window: 'five_hour' });
      return { ...pool, models: ['Gemini Flash'] };
    };
    expect(sessionShareOf(group(10, 9), group(30, 11), [ended(10, FLASH), ended(10)], TRIBES)).toBe(20);
  });

  it('tells nothing without a session between, a figure, the same window and source, or across a reset', () => {
    expect(sessionShareOf(argon(80, 9), argon(87, 11), [ended(12)], TRIBES)).toBeUndefined();
    expect(sessionShareOf(argon(null, 9), argon(87, 11), [ended(10)], TRIBES)).toBeUndefined();
    expect(sessionShareOf(argon(80, 9), argon(null, 11), [ended(10)], TRIBES)).toBeUndefined();
    const estimate = argon(87, 11, { source: 'estimate' });
    expect(sessionShareOf(argon(80, 9), estimate, [ended(10)], TRIBES)).toBeUndefined();
    const fiveHour = argon(87, 11, { window: 'five_hour' });
    expect(sessionShareOf(argon(80, 9), fiveHour, [ended(10)], TRIBES)).toBeUndefined();
    const reset = argon(80, 9, { resets_at: at(10) });
    expect(sessionShareOf(reset, argon(5, 11), [ended(10)], TRIBES)).toBeUndefined();
    const garbled = argon(80, 9, { observed_at: 'yesterday' });
    expect(sessionShareOf(garbled, argon(87, 11), [ended(10)], TRIBES)).toBeUndefined();
    expect(sessionShareOf(argon(80, 9), garbled, [ended(10)], TRIBES)).toBeUndefined();
  });
});

describe('withSessionShare', () => {
  const share = (pct: number): SessionShare => ({
    tribe: GEMINI,
    pool: 'gemini_models',
    model: 'argon',
    window: 'weekly',
    pct,
  });

  it('keeps the largest share seen of each window', () => {
    expect(withSessionShare([], argon(87, 11), 6)).toEqual([share(6)]);
    expect(withSessionShare([share(6)], argon(87, 11), 7)).toEqual([share(7)]);
    expect(withSessionShare([share(7)], argon(87, 11), 2)).toEqual([share(7)]);
    const other: SessionShare = { tribe: GEMINI, pool: 'gemini_models', window: 'five_hour', pct: 3 };
    expect(withSessionShare([other], argon(87, 11), 6)).toEqual([other, share(6)]);
  });
});

describe('sharesOfHistory', () => {
  it('sets each reading against the one before it of the same window', () => {
    const history = [argon(70, 8), argon(40, 8, { window: 'five_hour' }), argon(76, 10), argon(82.5, 12)];
    expect(sharesOfHistory(history, [ended(9), ended(11)], TRIBES)).toEqual([
      { tribe: GEMINI, pool: 'gemini_models', model: 'argon', window: 'weekly', pct: 6.5 },
    ]);
    expect(sharesOfHistory([], [ended(9)], TRIBES)).toEqual([]);
  });
});

describe('shareAheadOf', () => {
  const measured = (pct: number) =>
    [{ tribe: GEMINI, pool: 'gemini_models', model: 'argon', window: 'weekly', pct }] as const;

  it('is the share measured, the default before any, and never more than the warning margin', () => {
    expect(shareAheadOf([], argon(80, 9), CFG)).toBe(SESSION_SHARE_DEFAULT_PCT);
    expect(shareAheadOf(measured(1.5), argon(80, 9), CFG)).toBe(1.5);
    expect(shareAheadOf(measured(40), argon(80, 9), CFG)).toBe(CFG.warn_margin_pct);
  });
});

describe('manaStateOf with session shares', () => {
  const argonKnight = { tribe: GEMINI, model: ARGON };
  const stateAt = (used: number, shares?: readonly SessionShare[]) =>
    manaStateOf([argon(used, 9)], TRIBES, argonKnight, CFG, instant(9), shares);
  const measured = (pct: number): SessionShare[] => [
    { tribe: GEMINI, pool: 'gemini_models', model: 'argon', window: 'weekly', pct },
  ];

  it('closes the gauge when one more session would take it to the cap', () => {
    expect(stateAt(91, measured(7))).toBe('closed');
    expect(stateAt(90.9, measured(7))).toBe('warning');
    expect(stateAt(91, [])).toBe('closed');
    expect(stateAt(97, measured(0))).toBe('warning');
    expect(stateAt(87, measured(25))).toBe('ok');
    expect(stateAt(88, measured(25))).toBe('closed');
  });

  it('closes at the cap only, as before, when no shares are given', () => {
    expect(stateAt(97)).toBe('warning');
    expect(stateAt(98)).toBe('closed');
  });

  it('still sleeps on a spent window, and counts a reading without a figure as nothing used', () => {
    const spent = argon(100, 9, { exhausted: true });
    expect(manaStateOf([spent], TRIBES, argonKnight, CFG, instant(9), [])).toBe('asleep');
    const signal = argon(null, 9, { source: 'signal' });
    expect(manaStateOf([signal], TRIBES, argonKnight, CFG, instant(9), measured(3))).toBe('ok');
  });
});
