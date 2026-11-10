import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FIXTURES } from './__fixtures__/harness.ts';
import { parseLine } from './json.ts';
import { rateLimitWindowsOf, rejectionOf, spentWindowOf, usageWindowsOf } from './usage.ts';
import type { JsonObject } from './json.ts';

const linesOf = (file: string): JsonObject[] =>
  readFileSync(path.join(FIXTURES, file), 'utf8')
    .split(/\r?\n/)
    .map(parseLine)
    .filter((line): line is JsonObject => line !== undefined);

/** 2026-11-06 21:40 in Bangkok, while the spike ran. */
const SPIKE_NOW = Date.parse('2026-11-06T14:40:00Z');

describe('rate_limit_event', () => {
  const info = linesOf('probe.jsonl').find((line) => line.type === 'rate_limit_event')
    ?.rate_limit_info as JsonObject;

  it('gives the two windows of the account, utilization 0-1 as a percentage', () => {
    expect(rateLimitWindowsOf(info)).toEqual([
      { window: 'five_hour', used_pct: 47, resets_at: '2026-11-06T14:50:00.000Z' },
      { window: 'weekly', used_pct: 55, resets_at: '2026-11-08T13:00:00.000Z' },
    ]);
    expect(rateLimitWindowsOf(undefined)).toEqual([]);
  });

  it('says nothing while the status is allowed, and names a rejection (self-built, P1-16)', () => {
    expect(rejectionOf(info)).toBeUndefined();
    expect(rejectionOf({ status: 'rejected' })).toEqual({ detail: 'usage limit reached (unknown)' });
  });
});

// Self-built from the Agent SDK's `rateLimitType` (five_hour, seven_day, seven_day_opus…): none observed yet (P1-48).
describe('the window a rejected rate_limit_event spends', () => {
  const WEEK_RESET = '2026-11-08T13:00:00.000Z';
  const rejected = (type?: string) => ({
    status: 'rejected',
    resetsAt: 1794142800,
    ...(type === undefined ? {} : { rateLimitType: type }),
  });

  it('is the window its rateLimitType names, spent until resetsAt', () => {
    const week = { window: 'weekly', used_pct: 100, resets_at: WEEK_RESET };
    expect(spentWindowOf(rejected('seven_day'))).toEqual(week);
    expect(spentWindowOf(rejected('five_hour'))).toEqual({ ...week, window: 'five_hour' });
    expect(spentWindowOf(rejected('seven_day_opus'))).toEqual({ ...week, model: 'opus' });
    expect(spentWindowOf({ status: 'rejected', rateLimitType: 'seven_day' })).toEqual({
      window: 'weekly',
      used_pct: 100,
    });
  });

  it('is none while allowed, or for a type that names no window', () => {
    expect(spentWindowOf({ ...rejected('seven_day'), status: 'allowed' })).toBeUndefined();
    expect(spentWindowOf(rejected('overage'))).toBeUndefined();
    expect(spentWindowOf(rejected())).toBeUndefined();
    expect(spentWindowOf(undefined)).toBeUndefined();
  });
});

describe('the text of /usage', () => {
  const text = linesOf('usage-command.jsonl').find((line) => line.type === 'result')?.result as string;

  it('reads the session, the week and the week of one model, with their resets', () => {
    expect(usageWindowsOf(text, SPIKE_NOW)).toEqual([
      { window: 'five_hour', used_pct: 49, resets_at: '2026-11-06T14:50:00.000Z' },
      { window: 'weekly', used_pct: 56, resets_at: '2026-11-08T13:00:00.000Z' },
      { window: 'weekly', used_pct: 54, resets_at: '2026-11-08T13:00:00.000Z', model: 'Fable' },
    ]);
  });

  it('puts a reset with no year in the year that makes it upcoming', () => {
    const newYearsEve = Date.parse('2026-12-31T10:00:00Z');
    expect(usageWindowsOf('Current session: 100% used · resets Jan 1, 2am (UTC)', newYearsEve)).toEqual([
      { window: 'five_hour', used_pct: 100, resets_at: '2027-01-01T02:00:00.000Z' },
    ]);
  });

  it('reads a reset given as a time of today, in a zone east or west of UTC', () => {
    expect(
      usageWindowsOf('Current session: 80% used · resets 9:50pm (Asia/Bangkok)', SPIKE_NOW)[0]?.resets_at,
    ).toBe('2026-11-06T14:50:00.000Z');
    // Daylight saving time in New York ended on 1 November 2026: midnight is 05:00 UTC.
    expect(
      usageWindowsOf('Current session: 80% used · resets Nov 6, 12am (America/New_York)', SPIKE_NOW)[0]
        ?.resets_at,
    ).toBe('2026-11-06T05:00:00.000Z');
  });

  it('keeps the percentage when the reset cannot be read', () => {
    expect(usageWindowsOf('Current session: 3% used · resets Nov 6, 9pm (Mars/Olympus)', SPIKE_NOW)).toEqual([
      { window: 'five_hour', used_pct: 3 },
    ]);
    expect(usageWindowsOf('Current session: 3% used · resets Foo 6, 9pm (UTC)', SPIKE_NOW)).toEqual([
      { window: 'five_hour', used_pct: 3 },
    ]);
    expect(usageWindowsOf('Current session: 3% used · resets soon (UTC)\nSomething else', SPIKE_NOW)).toEqual(
      [{ window: 'five_hour', used_pct: 3 }],
    );
    expect(usageWindowsOf('Current week (all models): 0% used', SPIKE_NOW)).toEqual([
      { window: 'weekly', used_pct: 0 },
    ]);
  });
});
