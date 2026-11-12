// A run whose judge printed a stand-in for its notes (P1-56, (i) of the P1-50 report, Q5): what the session hands
// back as `structured`, from recorded-shape streams played by fake-agy.mjs.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fakeRunner, openWorld, request } from './__fixtures__/agy.ts';
import type { World } from './__fixtures__/agy.ts';
import type { RunResult, RunnerSignal } from '@elvaria/runner-core';

let world: World;
beforeEach(async () => {
  world = await openWorld();
});
afterEach(() => world.remove());

async function replay(fixture: string): Promise<RunResult> {
  const env = { ELVARIA_FAKE_AGY_REPLAY: fixture, ELVARIA_FAKE_AGY_EXIT: '0' };
  const session = await fakeRunner().spawn(request(world, env, {}));
  const signals: RunnerSignal[] = [];
  for await (const signal of session.signals) signals.push(signal);
  return session.wait();
}

describe('structured output of a replayed run', () => {
  // agy kept the stand-in printed first as `structured_output`; the real verdict came last in the answer.
  it('is the last JSON of the answer, not the stand-in agy kept', async () => {
    const result = await replay('constructed-placeholder-then-answer.jsonl');
    expect(result.outcome).toBe('completed');
    expect(result.structured).toEqual({
      notes: 'Ran the trigger break: e2e went red as expected; every check read.',
      result: 'pass',
    });
  });

  // The answer was a stand-in and nothing else: no `structured`, so the Steward sees a judge that left without a
  // verdict and opens the next one, instead of writing a `partial` verdict from a note nobody wrote.
  it('is none for a run that answered with a stand-in only', async () => {
    const result = await replay('constructed-placeholder-only.jsonl');
    expect(result.outcome).toBe('completed');
    expect(result).not.toHaveProperty('structured');
  });

  it('still takes the structured output of a recorded run whose answer holds the same JSON', async () => {
    const result = await replay('stream-full-run.jsonl');
    expect(result.structured).toMatchObject({ verdict: 'pass' });
  });
});
