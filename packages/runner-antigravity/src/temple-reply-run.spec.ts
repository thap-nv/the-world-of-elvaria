// PS-12f: the Monk's session on agy, which has no JSON Schema flag: one session in role `monk` with no tool, whose
// temple-reply comes back as the last JSON of its answer, from a constructed stream played by fake-agy.mjs (no real
// Temple run recorded yet). The Chancellor's office checks it against the contract and the pack (askTemple).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fakeRunner, openWorld, request } from './__fixtures__/agy.ts';
import type { World } from './__fixtures__/agy.ts';
import type { RunnerSignal } from '@elvaria/runner-core';

let world: World;
beforeEach(async () => {
  world = await openWorld();
});
afterEach(() => world.remove());

describe("the Monk's temple-reply on agy (PS-12f)", () => {
  it('is the JSON at the end of the answer of a session with no tool', async () => {
    const env = { ELVARIA_FAKE_AGY_REPLAY: 'constructed-temple-reply.jsonl', ELVARIA_FAKE_AGY_EXIT: '0' };
    const req = request(world, env, { role: 'monk' });
    const monk = { ...req, permissions: { ...req.permissions, tools: [], allow: [] } };
    const session = await fakeRunner().spawn(monk);
    const signals: RunnerSignal[] = [];
    for await (const signal of session.signals) signals.push(signal);
    const result = await session.wait();
    expect(result.outcome).toBe('completed');
    expect(result.structured).toEqual({
      version: 1,
      decisions: [
        {
          group: 'tests_fail',
          rung: 'check',
          why: 'The territory has a test check; run it before review.',
          letter: {
            source_verdict: 'q_20261106_7k3m2a-1',
            body: 'Run the `test` check of dc1-se-team before review.',
            refs: [],
          },
        },
      ],
      reviews: [],
    });
    expect(result.usage.tokens).toBeGreaterThan(0);
  });
});
