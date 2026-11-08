// A quota error replayed through fake-agy.mjs (P1-16's real run, and the changelog's wording): the `rate_limit`
// signal carries the reset agy names, so the Steward's first probe comes just after it (P1-22).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fakeRunner, openWorld, request } from './__fixtures__/agy.ts';
import type { World } from './__fixtures__/agy.ts';
import type { RunnerSignal } from '@elvaria/runner-core';

let world: World;
beforeEach(async () => {
  world = await openWorld();
});
afterEach(() => world.remove());

async function lastSignal(fixture: string): Promise<RunnerSignal | undefined> {
  const env = { ELVARIA_FAKE_AGY_REPLAY: fixture, ELVARIA_FAKE_AGY_EXIT: '3' };
  const session = await fakeRunner().spawn(request(world, env));
  const signals: RunnerSignal[] = [];
  for await (const signal of session.signals) signals.push(signal);
  await session.wait();
  return signals.at(-1);
}

describe('a quota error', () => {
  it.each([
    ['stream-quota-exhausted.jsonl', 'Resets in 4h53m54s', 17_634],
    ['constructed-rate-limit.jsonl', 'reset after 2h31m12s', 9072],
  ])('signals the reset agy names (%s: %s)', async (fixture, _words, seconds) => {
    const before = Date.now();
    const signal = await lastSignal(fixture);
    expect(signal?.kind).toBe('rate_limit');
    const named = signal?.kind === 'rate_limit' ? Date.parse(signal.resets_at ?? '') : Number.NaN;
    expect(named - seconds * 1000).toBeGreaterThanOrEqual(before);
    expect(named - seconds * 1000).toBeLessThanOrEqual(Date.now());
  });
});
