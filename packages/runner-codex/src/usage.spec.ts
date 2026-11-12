// The account's windows from `account/rateLimits/read` (fixture rate-limits.json, the spike's answer, its account
// id redacted) and the probe's answer from them.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FIXTURES } from './__fixtures__/codex.ts';
import { probeOf, windowsOf } from './usage.ts';

const ANSWER = JSON.parse(readFileSync(path.join(FIXTURES, 'rate-limits.json'), 'utf8')) as Record<
  string,
  unknown
>;

const limit = (primary: number, secondary: number, extra: Record<string, unknown> = {}) => ({
  primary: { usedPercent: primary, windowDurationMins: 300, resetsAt: 1_794_502_073 },
  secondary: { usedPercent: secondary, windowDurationMins: 10_080, resetsAt: 1_794_965_542 },
  ...extra,
});

describe('windowsOf', () => {
  it('reads the 5-hour and the weekly window of the whole account', () => {
    expect(windowsOf(ANSWER)).toEqual([
      { window: 'five_hour', used_pct: 0, resets_at: '2026-11-12T16:47:53.000Z' },
      { window: 'weekly', used_pct: 0, resets_at: '2026-11-18T01:32:22.000Z' },
    ]);
  });

  it('names the model a limit caps, and skips a window of a length it does not know', () => {
    const answer = {
      rateLimitsByLimitId: {
        astra: limit(40, 10, { normalModelSlug: 'gpt-6-astra' }),
        odd: { primary: { usedPercent: 5, windowDurationMins: 60 } },
      },
    };
    expect(windowsOf(answer).map(({ window, model }) => [window, model])).toEqual([
      ['five_hour', 'gpt-6-astra'],
      ['weekly', 'gpt-6-astra'],
    ]);
    expect(windowsOf({ rateLimits: limit(1, 2) })).toHaveLength(2);
    expect(windowsOf('nonsense')).toEqual([]);
  });
});

describe('probeOf', () => {
  it('is ok while no window of the account is spent, with the windows for the gauge', () => {
    expect(probeOf(ANSWER)).toMatchObject({ status: 'ok', windows: windowsOf(ANSWER) });
    expect(probeOf({})).toEqual({ status: 'ok' });
  });

  it('is rate limited when a window is spent, until its reset', () => {
    const answer = { rateLimits: limit(100, 40) };
    expect(probeOf(answer)).toMatchObject({
      status: 'rate_limited',
      detail: 'no mana left in the five_hour window',
      resets_at: '2026-11-12T16:47:53.000Z',
    });
  });

  it('is rate limited when the account says so, and an error without an answer', () => {
    const answer = {
      ordinaryUsageAllowed: false,
      rateLimits: limit(10, 10, { rateLimitReachedType: 'workspace_owner_credits_depleted' }),
    };
    expect(probeOf(answer)).toMatchObject({
      status: 'rate_limited',
      detail: 'the account allows no usage now (workspace_owner_credits_depleted)',
    });
    expect(probeOf({ ordinaryUsageAllowed: false })).toMatchObject({
      detail: expect.stringMatching(/no reason given/) as unknown,
    });
    expect(probeOf(undefined)).toEqual({ status: 'error', detail: 'account/rateLimits/read: no answer' });
  });
});
