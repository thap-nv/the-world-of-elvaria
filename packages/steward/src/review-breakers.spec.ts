// A review the breakers keep stopping (implementation-plan §3.4, P1-23; phase-1 report §5.2): the first verifier a
// breaker stops leaves the review to the next one, the second sends the quest to the infirmary with the bell, and
// no third verifier session opens. A verifier its CLI stopped at its own limit counts the same.
import { createFakeRunner } from '@elvaria/runner-core';
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

/** Each verifier session it spawns reports `tokens` at once, then hangs; the assignee's work is submitted. */
function spendingJudges(tribe: string, tokens: number, spawned: SpawnRequest[]): AgentRunner {
  const fake = createFakeRunner({
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

describe('a review the breakers keep stopping', () => {
  it('goes to the infirmary with the bell at the second verifier stopped, and opens no third', async () => {
    const spawned: SpawnRequest[] = [];
    const { kingdom, steward } = await open(() => ({
      runners: {
        claude: spendingJudges('claude', 240_001, spawned),
        gemini: spendingJudges('gemini', 240_001, spawned),
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
          'breaker:tokens: 240001 tokens, limit 240000; a breaker stopped 2 verifiers of run 1, so no further one opens: raise the budget (quest edit) before a retry',
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
      reason: expect.stringMatching(/^breaker:turns; a breaker stopped 2 verifiers of run 1/) as unknown,
    });
    expect(verifiersOf(spawned)).toHaveLength(2);
    expect(kingdom.warnings.join('\n')).toContain("'s review stopped, breaker:turns");
  });
});
