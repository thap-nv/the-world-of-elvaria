// `/usage` as agy 1.5.2 answered it (fixtures/usage-json.jsonl, spike P1-12a §7) and the probe built on it.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FIXTURES } from './__fixtures__/agy.ts';
import { probeOf, usageBuckets, windowsOf } from './usage.ts';
import type { UsageBucket } from './usage.ts';

const RECORDED = readFileSync(path.join(FIXTURES, 'usage-json.jsonl'), 'utf8');
/** What each group's description lists (P1-22): Argon is in neither on this Pro plan. */
const GEMINI_GROUP = ['Gemini Flash', 'Gemini Pro'];
const THIRD_PARTY_GROUP = ['Claude Opus', 'Claude Sonnet', 'GPT-OSS'];

describe('usageBuckets', () => {
  it('reads every bucket of the recorded answer into pools and windows', () => {
    expect(usageBuckets(RECORDED)).toEqual([
      {
        id: 'gemini-weekly',
        pool: 'gemini_models',
        window: 'weekly',
        used_pct: 0,
        resets_at: null,
        pool_wide: true,
        models: GEMINI_GROUP,
      },
      {
        id: 'gemini-5h',
        pool: 'gemini_models',
        window: 'five_hour',
        used_pct: 0,
        resets_at: null,
        pool_wide: true,
        models: GEMINI_GROUP,
      },
      {
        id: '3p-weekly',
        pool: 'claude_gpt_models',
        window: 'weekly',
        used_pct: 0,
        resets_at: null,
        pool_wide: true,
        models: THIRD_PARTY_GROUP,
      },
      {
        id: '3p-5h',
        pool: 'claude_gpt_models',
        window: 'five_hour',
        used_pct: 0,
        resets_at: null,
        pool_wide: true,
        models: THIRD_PARTY_GROUP,
      },
      {
        id: 'gemini-argon-wtu-weekly',
        pool: 'gemini_models',
        window: 'weekly',
        used_pct: 2.14,
        resets_at: '2026-11-13T14:47:50Z',
        pool_wide: false,
      },
    ]);
  });

  it('lists no models for a group whose description names none', () => {
    const groups = [
      { description: 'Models within this group:  ', buckets: [{ id: 'gemini-5h', remaining_fraction: 1 }] },
      { description: 7, buckets: [{ id: '3p-5h', remaining_fraction: 1 }] },
    ];
    const buckets = usageBuckets(JSON.stringify({ command: { data: { groups } } })) ?? [];
    expect(buckets.map((found) => found.models)).toEqual([undefined, undefined]);
  });

  it('says when the answer is not that shape', () => {
    expect(usageBuckets('not json')).toBeUndefined();
    expect(usageBuckets('{"command": {"data": {}}}')).toBeUndefined();
    expect(usageBuckets('null')).toBeUndefined();
    expect(
      usageBuckets(
        '{"command":{"data":{"groups":[{"buckets":[{"id":7},{"id":"x","remaining_fraction":1}]}]}}}',
      ),
    ).toEqual([
      { id: 'x', pool: undefined, window: undefined, used_pct: 0, resets_at: null, pool_wide: false },
    ]);
  });
});

const bucket = (id: string, used: number, resets: string | null = null): UsageBucket => ({
  id,
  pool: id.startsWith('3p-') ? 'claude_gpt_models' : 'gemini_models',
  window: id.endsWith('5h') ? 'five_hour' : 'weekly',
  used_pct: used,
  resets_at: resets,
  pool_wide: !id.includes('argon'),
});

describe('windowsOf', () => {
  it("turns the recorded buckets into the account's windows, the Argon cap naming its model", () => {
    expect(windowsOf(usageBuckets(RECORDED) ?? [])).toEqual([
      { window: 'weekly', used_pct: 0, pool: 'gemini_models', models: GEMINI_GROUP },
      { window: 'five_hour', used_pct: 0, pool: 'gemini_models', models: GEMINI_GROUP },
      { window: 'weekly', used_pct: 0, pool: 'claude_gpt_models', models: THIRD_PARTY_GROUP },
      { window: 'five_hour', used_pct: 0, pool: 'claude_gpt_models', models: THIRD_PARTY_GROUP },
      {
        window: 'weekly',
        used_pct: 2.14,
        pool: 'gemini_models',
        resets_at: '2026-11-13T14:47:50Z',
        model: 'argon',
      },
    ]);
  });

  it('leaves out a bucket of an unknown pool or window', () => {
    const odd = {
      id: 'x',
      pool: undefined,
      window: undefined,
      used_pct: 0,
      resets_at: null,
      pool_wide: false,
    };
    expect(windowsOf([odd, { ...odd, pool: 'gemini_models' }])).toEqual([]);
  });
});

describe('probeOf', () => {
  it('is ok while the pools the tribe runs on have mana', () => {
    expect(probeOf(usageBuckets(RECORDED) ?? [], ['gemini_models'])).toEqual({ status: 'ok' });
  });

  it('is rate limited when a pool-wide bucket is empty, until its last reset', () => {
    const empty = [
      bucket('gemini-5h', 100, '2026-11-07T05:00:00Z'),
      bucket('gemini-weekly', 100, '2026-11-12T00:00:00Z'),
    ];
    expect(probeOf(empty, ['gemini_models'])).toEqual({
      status: 'rate_limited',
      detail: 'no mana left in gemini-5h, gemini-weekly',
      resets_at: '2026-11-12T00:00:00Z',
    });
  });

  it('reads the mana-out of P1-16 (agy 1.5.3): the Claude and GPT pool empty until its 5-hour reset', () => {
    const before = usageBuckets(
      readFileSync(path.join(FIXTURES, 'usage-json-mana-out-before.jsonl'), 'utf8'),
    );
    const drained = usageBuckets(
      readFileSync(path.join(FIXTURES, 'usage-json-mana-out-drained.jsonl'), 'utf8'),
    );
    expect(probeOf(before ?? [], ['gemini_models', 'claude_gpt_models'])).toEqual({ status: 'ok' });
    expect(probeOf(drained ?? [], ['gemini_models', 'claude_gpt_models'])).toEqual({
      status: 'rate_limited',
      detail: 'no mana left in 3p-5h',
      resets_at: '2026-11-08T06:01:26Z',
    });
    expect(probeOf(drained ?? [], ['gemini_models'])).toEqual({ status: 'ok' });
    // After the reset the 5-hour bucket is back (the revived session had started using it): the probe wakes the pool.
    const reset = usageBuckets(
      readFileSync(path.join(FIXTURES, 'usage-json-mana-out-after-reset.jsonl'), 'utf8'),
    );
    expect(probeOf(reset ?? [], ['gemini_models', 'claude_gpt_models'])).toEqual({ status: 'ok' });
    expect(windowsOf(drained ?? []).filter(({ pool }) => pool === 'claude_gpt_models')).toEqual([
      {
        window: 'weekly',
        used_pct: 50.56,
        pool: 'claude_gpt_models',
        resets_at: '2026-11-15T01:01:26Z',
        models: THIRD_PARTY_GROUP,
      },
      {
        window: 'five_hour',
        used_pct: 100,
        pool: 'claude_gpt_models',
        resets_at: '2026-11-08T06:01:26Z',
        models: THIRD_PARTY_GROUP,
      },
    ]);
  });

  it('ignores a pool the tribe does not run on, and a cap of one model', () => {
    expect(probeOf([bucket('3p-5h', 100)], ['gemini_models'])).toEqual({ status: 'ok' });
    expect(probeOf([bucket('gemini-argon-wtu-weekly', 100)], ['gemini_models'])).toEqual({ status: 'ok' });
    expect(probeOf([bucket('3p-weekly', 100)], ['gemini_models', 'claude_gpt_models'])).toEqual({
      status: 'rate_limited',
      detail: 'no mana left in 3p-weekly',
    });
  });
});
