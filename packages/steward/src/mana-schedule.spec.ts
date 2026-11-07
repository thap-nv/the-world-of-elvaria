// When the Steward asks an account about its mana (implementation-plan §3.5, ADR 0009, owner's decision after
// P1-05): a sleeping pool just after the reset its session named, again two minutes later when the account is
// late; an awake tribe right after each of its sessions, in the background, so no work waits on a gauge.
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil, wakesAfter } from './__fixtures__/kingdom.ts';
import type { Bench, BenchOptions } from './__fixtures__/kingdom.ts';
import type { Steward, StewardDeps } from './types.ts';
import type { AgentRunner, ProbeOptions, ProbeResult, RunnerSignal } from '@elvaria/runner-core';

let current: Bench | undefined;
let running: Steward | undefined;

async function open(
  options: BenchOptions = {},
  overrides: (kingdom: Bench) => Partial<StewardDeps> = () => ({}),
) {
  current = await bench(options);
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

const lines = async (kingdom: Bench) => (await openEventLog(kingdom.root).read()).events;
const statusOf = async (kingdom: Bench, title: string) => (await kingdom.quest(title)).status;

/** A runner whose sessions first say which reset their usage limit waits for, as Claude's stream does. */
function namingReset(runner: AgentRunner, resetsAt: string): AgentRunner {
  const spawn: AgentRunner['spawn'] = async (req) => {
    const session = await runner.spawn(req);
    const limit: RunnerSignal = { kind: 'rate_limit', detail: 'usage limit reached', resets_at: resetsAt };
    async function* signals(): AsyncGenerator<RunnerSignal> {
      yield limit;
      yield* session.signals;
    }
    return { ...session, signals: signals() };
  };
  return { ...runner, spawn };
}

describe('a sleeping pool', () => {
  it('is probed a minute after the reset its session named, and two minutes later when the account is late', async () => {
    const { kingdom, steward } = await open(
      { plays: { work: { 'Hits the limit': ['rate_limit', 'submit'] } }, probes: { claude: wakesAfter(1) } },
      (k) => ({ runners: { claude: namingReset(k.runners.claude, '2026-11-07T09:40:00+07:00') } }),
    );
    await kingdom.command('create_quest', questPayload('Hits the limit'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await statusOf(kingdom, 'Hits the limit')) === 'review',
    );
    const probes = (await lines(kingdom)).filter(({ type }) => type === 'mana.probe');
    expect(probes.map(({ ts }) => ts.slice(11, 16))).toEqual(['09:41', '09:43']);
  });
});

describe('an awake tribe', () => {
  it('reads its account right after each of its sessions, without a model call, and the next tick takes it in', async () => {
    const calls: boolean[] = [];
    const reading = (options: ProbeOptions): ProbeResult => {
      calls.push(options.ping ?? true);
      return { status: 'ok', windows: [{ window: 'five_hour', used_pct: 10 * calls.length }] };
    };
    const { kingdom, steward } = await open({ probes: { claude: reading } });
    await kingdom.command('create_quest', questPayload('Spends a little'));
    // Tick 1 reads the gauge (quests in play) and opens the session; tick 2 records its end and reads again.
    for (let tick = 0; tick < 2; tick += 1) {
      await steward.tick();
      await new Promise((resolve) => setTimeout(resolve, 15));
      kingdom.clock.advance(1);
    }
    expect(calls).toEqual([false, false]);
    await steward.tick();
    const levels = (await lines(kingdom)).filter(({ type }) => type === 'mana.level');
    expect(levels.map(({ data }) => (data as { used_pct: number }).used_pct)).toEqual([10, 20]);
  });
});
