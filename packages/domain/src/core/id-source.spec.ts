import { describe, expect, it } from 'vitest';

import { ULID_MAX_TIME_MS } from '../constants.ts';
import { InstantSchema } from './clock.ts';
import { createIdSource, formatDatedId, formatUlid } from './id-source.ts';
import { CAMPAIGN_ID_PATTERN, LESSON_ID_PATTERN, QUEST_ID_PATTERN, ULID_PATTERN } from './ids.ts';
import type { Clock, Instant } from './clock.ts';
import type { IdSource, RandomSource } from './id-source.ts';

const instant = (ms: number): Instant => InstantSchema.parse(ms);
const filled = (byte: number): RandomSource => ({ bytes: (count) => new Uint8Array(count).fill(byte) });

/** A clock the test moves by hand. */
function manualClock(start: number): Clock & { set(ms: number): void } {
  let now = start;
  return { now: () => instant(now), set: (ms) => (now = ms) };
}

function source(clock: Clock, random: RandomSource, tz = 'Asia/Ho_Chi_Minh'): IdSource {
  const result = createIdSource({ clock, random, tz });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('formatUlid', () => {
  it('encodes the time like the ulid spec example', () => {
    expect(formatUlid(instant(1469918176385), 0n)).toBe('01ARYZ6S410000000000000000');
  });

  it('uses all 80 random bits', () => {
    expect(formatUlid(instant(0), (1n << 80n) - 1n)).toBe('0000000000ZZZZZZZZZZZZZZZZ');
  });
});

describe('formatDatedId', () => {
  it('writes the prefix, the local day and six lower-case base32 characters', () => {
    expect(formatDatedId('q', '20261106', new Uint8Array([0, 0, 0, 0]))).toBe('q_20261106_000000');
    expect(formatDatedId('L', '20261106', new Uint8Array([255, 255, 255, 255]))).toBe('L_20261106_zzzzzz');
  });
});

describe('createIdSource', () => {
  const morning = Date.parse('2026-11-06T02:00:00Z');

  it('refuses an unknown time zone up front', () => {
    expect(createIdSource({ clock: manualClock(morning), random: filled(0), tz: 'Nowhere/City' })).toEqual({
      ok: false,
      error: 'invalid_time_zone',
    });
  });

  it('makes quest, campaign and lesson ids dated by the kingdom day', () => {
    const late = Date.parse('2026-11-05T18:00:00Z'); // already 6 November in Ho Chi Minh City
    const ids = source(manualClock(late), filled(7));
    expect(ids.quest()).toMatch(QUEST_ID_PATTERN);
    expect(ids.quest()).toMatch(/^q_20261106_/);
    expect(ids.campaign()).toMatch(CAMPAIGN_ID_PATTERN);
    expect(ids.lesson()).toMatch(LESSON_ID_PATTERN);
  });

  it('keeps ulids strictly increasing within one millisecond', () => {
    const ids = source(manualClock(morning), filled(9));
    const first = ids.ulid();
    const second = ids.ulid();
    expect(first).toMatch(ULID_PATTERN);
    expect(second > first).toBe(true);
    expect(second.slice(0, 10)).toBe(first.slice(0, 10));
  });

  it('draws fresh randomness in a new millisecond', () => {
    const clock = manualClock(morning);
    const ids = source(clock, filled(0));
    const first = ids.ulid();
    clock.set(morning + 1);
    const second = ids.ulid();
    expect(second.slice(0, 10) > first.slice(0, 10)).toBe(true);
    expect(second.slice(10)).toBe('0000000000000000');
  });

  it('stays ordered when the clock steps back', () => {
    const clock = manualClock(morning);
    const ids = source(clock, filled(1));
    const first = ids.ulid();
    clock.set(morning - 60_000);
    const second = ids.ulid();
    expect(second > first).toBe(true);
    expect(second.slice(0, 10)).toBe(first.slice(0, 10));
  });

  it('wraps the random part instead of overflowing 80 bits', () => {
    const ids = source(manualClock(morning), filled(255));
    expect(ids.ulid().slice(10)).toBe('ZZZZZZZZZZZZZZZZ');
    expect(ids.ulid().slice(10)).toBe('0000000000000000');
  });

  it('clamps a time beyond the ULID range', () => {
    const ids = source(manualClock(ULID_MAX_TIME_MS + 5), filled(0), 'UTC');
    expect(ids.ulid().slice(0, 10)).toBe('7ZZZZZZZZZ');
  });
});
