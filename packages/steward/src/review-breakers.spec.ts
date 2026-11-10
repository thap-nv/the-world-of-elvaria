// A review the breakers keep stopping (implementation-plan §3.4, P1-23; phase-1 report §5.2): the first verifier a
// breaker stops leaves the review to the next one, the second sends the quest to the infirmary with the bell, and
// no third verifier session opens. A verifier its CLI stopped at its own limit counts the same.
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward, StewardDeps } from './types.ts';
import type { AgentRunner, RunnerSignal, SpawnRequest } from '@elvaria/runner-core';

let current: Bench | undefined;
let running: Steward | undefined;

async function open(overrides: (kingdom: Bench) => Partial<StewardDeps>) {
  current = await bench();
  running = current.steward(overrides(current));
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

/**
 * Each verifier session it spawns reports `tokens` at once, then hangs; the assignee's work is submitted. The bench
 * makes the fake, so tickUntil does not wait for the hung judges to end (P1-39).
 */
function spendingJudges(kingdom: Bench, tribe: string, tokens: number, spawned: SpawnRequest[]): AgentRunner {
  const fake = kingdom.fake({
    tribe: tribe as never,
    scenarioOf: (req) => (req.role === 'verifier' ? 'hang' : 'submit'),
  });
  return {
    ...fake,
    spawn: async (req) => {
      spawned.push(req);
      const session = await fake.spawn(req);
      if (req.role !== 'verifier') return session;
      async function* signals(): AsyncGenerator<RunnerSignal> {
        yield { kind: 'usage', tokens };
        yield* session.signals;
      }
      return { ...session, signals: signals() };
    },
  };
}

/** Verifier sessions that end as the CLI's own `--max-turns` ends them. */
const judgesAtMaxTurns = (judging: AgentRunner, spawned: SpawnRequest[]): AgentRunner => ({
  ...judging,
  spawn: async (req) => {
    spawned.push(req);
    const session = await judging.spawn(req);
    if (req.role !== 'verifier') return session;
    return { ...session, wait: async () => ({ ...(await session.wait()), outcome: 'max_turns' as const }) };
  },
});

const verifiersOf = (spawned: readonly SpawnRequest[]) => spawned.filter(({ role }) => role === 'verifier');

// A judge may spend breakers.verifier_tokens_multiplier (2) times the quest's 240 000 tokens (P1-18 (f)).
describe('a review the breakers keep stopping', () => {
  it('goes to the infirmary with the bell at the second verifier stopped, and opens no third', async () => {
    const spawned: SpawnRequest[] = [];
    const { kingdom, steward } = await open((k) => ({
      runners: {
        claude: spendingJudges(k, 'claude', 480_001, spawned),
        gemini: spendingJudges(k, 'gemini', 480_001, spawned),
      },
    }));
    await kingdom.command('create_quest', questPayload('Judged at length'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Judged at length')).status === 'infirmary',
    );
    const quest = await kingdom.quest('Judged at length');
    const judges = quest.attempt_log.filter(({ role }) => role === 'verifier');
    expect(judges.map(({ outcome }) => outcome)).toEqual(['breaker', 'breaker']);
    expect(quest).toMatchObject({ status: 'infirmary', verifier: null, attempts: 1 });
    expect(kingdom.notices).toEqual([
      {
        kind: 'infirmary',
        quest: { id: quest.id, title: 'Judged at length', rank: 'D' },
        reason:
          'breaker:tokens: 480001 tokens, limit 480000; 2 verifiers of run 1 left without a verdict, so no further one opens: raise the budget (quest edit) before a retry',
        // In parts too (P1-32): the last verifier's breaker, and how many of the run it stopped.
        trip: 'tokens',
        detail: { message: '480001 tokens, limit 480000', verifiers_stopped: 2 },
      },
    ]);
    // The quest waits for the owner: no third verifier, no session left running.
    for (let tick = 0; tick < 3; tick += 1) {
      kingdom.clock.advance(1);
      await steward.tick();
    }
    expect(verifiersOf(spawned)).toHaveLength(2);
    expect(steward.running()).toBe(0);
    expect(kingdom.notices).toHaveLength(1);
    for (const judge of judges) expect((await kingdom.character(judge.character ?? '')).status).toBe('idle');
  });

  it("sends it back to review on the owner's retry, where one more cut is not yet a stall (P1-26)", async () => {
    const spawned: SpawnRequest[] = [];
    const { kingdom, steward } = await open((k) => ({
      runners: {
        claude: spendingJudges(k, 'claude', 480_001, spawned),
        gemini: spendingJudges(k, 'gemini', 480_001, spawned),
      },
    }));
    await kingdom.command('create_quest', questPayload('Judged again'));
    const sick = async () => (await kingdom.quest('Judged again')).status === 'infirmary';
    await tickUntil(steward, kingdom.clock, sick);
    const stalled = await kingdom.quest('Judged again');
    await kingdom.command('retry', { quest: stalled.id });
    await steward.tick();
    // The same run goes on: the assignee's work stays; a new judge opens once its checks ended (P1-25).
    expect(await kingdom.quest('Judged again')).toMatchObject({ status: 'review', attempts: 1 });
    await tickUntil(steward, kingdom.clock, () => Promise.resolve(verifiersOf(spawned).length === 3));
    const retried = await kingdom.quest('Judged again');
    expect(retried).toMatchObject({ status: 'review', assignee: stalled.assignee, attempts: 1 });
    expect(retried.verifier).toEqual(expect.any(String));
    // The count started over at the retry: the third judge cut leaves the review to a fourth.
    await tickUntil(steward, kingdom.clock, () => Promise.resolve(verifiersOf(spawned).length === 4));
    expect((await kingdom.quest('Judged again')).status).toBe('review');
    expect(kingdom.notices).toHaveLength(1);
    await tickUntil(steward, kingdom.clock, sick);
    const again = await kingdom.quest('Judged again');
    expect(again.attempt_log.filter(({ role }) => role === 'verifier').map(({ n }) => n)).toEqual([
      1, 1, 1, 1,
    ]);
    expect(kingdom.notices.at(-1)).toMatchObject({
      kind: 'infirmary',
      reason: expect.stringContaining('2 verifiers of run 1 left without a verdict') as unknown,
    });
  });

  it('counts a verifier its CLI stopped at its own turn limit as one a breaker stopped', async () => {
    const spawned: SpawnRequest[] = [];
    const { kingdom, steward } = await open((k) => ({
      runners: {
        claude: judgesAtMaxTurns(k.runners.claude, spawned),
        gemini: judgesAtMaxTurns(k.runners.gemini, spawned),
      },
    }));
    await kingdom.command('create_quest', questPayload('Judged in circles'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Judged in circles')).status === 'infirmary',
    );
    const quest = await kingdom.quest('Judged in circles');
    expect(quest.attempt_log.filter(({ role }) => role === 'verifier').map(({ outcome }) => outcome)).toEqual(
      ['breaker', 'breaker'],
    );
    expect(kingdom.notices.at(-1)).toMatchObject({
      kind: 'infirmary',
      reason: expect.stringMatching(/^breaker:turns; 2 verifiers of run 1 left without a verdict/) as unknown,
    });
    expect(verifiersOf(spawned)).toHaveLength(2);
    expect(kingdom.warnings.join('\n')).toContain("'s review stopped, breaker:turns");
  });
});
