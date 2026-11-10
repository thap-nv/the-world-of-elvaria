// A gauge closes one session before the cap, by the share of its window a session was seen to take, also after a
// restart (implementation-plan §3.5, P1-48, P1-22 (b)); a usage limit that names its spent window sleeps that gauge
// until that window's reset (P1-48, P1-22 (d)).
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import type { Bench, BenchOptions, CastMember } from './__fixtures__/kingdom.ts';
import type { StewardDeps, Steward } from './types.ts';
import type { ReportedWindow } from '@elvaria/domain';
import type { AgentRunner, ProbeOptions, ProbeResult, RunnerSignal } from '@elvaria/runner-core';

let current: Bench | undefined;
const stewards: Steward[] = [];

async function open(
  options: BenchOptions = {},
  overrides: (kingdom: Bench) => Partial<StewardDeps> = () => ({}),
) {
  current ??= await bench(options);
  const steward = current.steward(overrides(current));
  stewards.push(steward);
  expect(await steward.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward };
}

afterEach(async () => {
  for (const steward of stewards.splice(0)) await steward.stop();
  await current?.remove();
  current = undefined;
});

const linesOf = async (kingdom: Bench, type: string) =>
  (await openEventLog(kingdom.root).read()).events.filter((event) => event.type === type);
const questOf = (kingdom: Bench, title: string) => kingdom.quest(title);

const WEEK_RESET = '2026-11-14T00:00:00.000Z';
const JUDGES: readonly CastMember[] = [
  { id: 'sable', cls: 'judge', model: 'claude-opus-5-5' },
  { id: 'orin', cls: 'judge', tribe: 'gemini', model: 'gemini-3.8-flash-low' },
];

/** Claude's /usage: the week at 80 % before the first session, at 89 % after it (9 points a session). */
function weekOf(): (options: ProbeOptions) => ProbeResult {
  let reads = 0;
  return ({ ping = true }) => {
    if (ping) return { status: 'ok' };
    reads += 1;
    const week = { window: 'weekly', used_pct: reads > 1 ? 89 : 80, resets_at: WEEK_RESET } as const;
    return { status: 'ok', windows: [week] };
  };
}

/** Ticks a few times, and says whether the quest is still open with nobody on it. */
async function stillOpen(kingdom: Bench, steward: Steward, title: string): Promise<boolean> {
  for (let tick = 0; tick < 3; tick += 1) {
    await steward.tick();
    kingdom.clock.advance(1);
  }
  const quest = await questOf(kingdom, title);
  return quest.status === 'open' && quest.assignee === null;
}

describe('a gauge one session before the cap (P1-48, P1-22 (b))', () => {
  const cast = [{ id: 'thorn', cls: 'knight' }, ...JUDGES];

  it('takes no more work once one more session would take a window to the cap', async () => {
    const { kingdom, steward } = await open({ cast, probes: { claude: weekOf() } });
    await kingdom.command('create_quest', questPayload('First'));
    await tickUntil(steward, kingdom.clock, async () => (await questOf(kingdom, 'First')).status === 'done');
    const levels = (await linesOf(kingdom, 'mana.level')).map(({ data }) => data.used_pct);
    expect(levels).toEqual([80, 89]);
    // 89 + 9 reaches the cap of 98; the default share (7) would have let one more session open.
    await kingdom.command('create_quest', questPayload('Second'));
    expect(await stillOpen(kingdom, steward, 'Second')).toBe(true);
  });

  it('measures the share again from the log after a restart', async () => {
    const first = await open({ cast, probes: { claude: weekOf() } });
    await first.kingdom.command('create_quest', questPayload('First'));
    const done = async () => (await questOf(first.kingdom, 'First')).status === 'done';
    await tickUntil(first.steward, first.kingdom.clock, done);
    await first.steward.stop();
    const { kingdom, steward } = await open();
    await kingdom.command('create_quest', questPayload('Second'));
    expect(await stillOpen(kingdom, steward, 'Second')).toBe(true);
  });
});

/** `runner` whose sessions first report `window`, as a rejected rate_limit_event of Claude Code does (runner-claude). */
function rejecting(runner: AgentRunner, window: ReportedWindow): AgentRunner {
  return {
    ...runner,
    spawn: async (req) => {
      const session = await runner.spawn(req);
      async function* signals(): AsyncGenerator<RunnerSignal> {
        yield { kind: 'mana', windows: [window] };
        yield* session.signals;
      }
      return { ...session, signals: signals(), wait: () => session.wait(), kill: (why) => session.kill(why) };
    },
  };
}

/** /usage cannot be read: only what the session said tells which gauge ran out. */
const unread = ({ ping = true }: ProbeOptions): ProbeResult =>
  ping ? { status: 'rate_limited' } : { status: 'error', detail: 'no /usage' };

describe('a usage limit that names its window (P1-48, P1-22 (d))', () => {
  const play = { work: { 'Week runs dry': ['rate_limit', 'submit'] } } as const;
  const paused = (kingdom: Bench) => async () =>
    (await questOf(kingdom, 'Week runs dry')).status === 'paused_mana';

  it('sleeps the weekly gauge until the reset the rejection named', async () => {
    const week = { window: 'weekly', used_pct: 100, resets_at: WEEK_RESET } as const;
    const { kingdom, steward } = await open(
      { cast: [{ id: 'thorn', cls: 'knight' }, ...JUDGES], plays: play, probes: { claude: unread } },
      (k) => ({ runners: { ...k.runners, claude: rejecting(k.runners.claude, week) } }),
    );
    await kingdom.command('create_quest', questPayload('Week runs dry'));
    await tickUntil(steward, kingdom.clock, paused(kingdom));
    const asleep = (await linesOf(kingdom, 'mana.exhausted')).map(({ data }) => data);
    expect(asleep).toEqual([{ tribe: 'claude', pool: 'claude', resets_at: WEEK_RESET }]);
  });

  it("sleeps only one model's weekly cap when the rejection names it: the other models go on", async () => {
    const opusWeek = { window: 'weekly', used_pct: 100, model: 'opus', resets_at: WEEK_RESET } as const;
    const cast = [
      { id: 'thorn', cls: 'knight', model: 'claude-opus-5-5' },
      { id: 'kael', cls: 'knight' },
      ...JUDGES,
    ];
    const { kingdom, steward } = await open({ cast, plays: play, probes: { claude: unread } }, (k) => ({
      runners: { ...k.runners, claude: rejecting(k.runners.claude, opusWeek) },
    }));
    await kingdom.command('create_quest', questPayload('Week runs dry', { assignee: 'thorn' }));
    await tickUntil(steward, kingdom.clock, paused(kingdom));
    const asleep = (await linesOf(kingdom, 'mana.exhausted')).map(({ data }) => data);
    expect(asleep).toEqual([{ tribe: 'claude', pool: 'claude', model: 'opus', resets_at: WEEK_RESET }]);
    await kingdom.command('create_quest', questPayload('Sonnet goes on'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await questOf(kingdom, 'Sonnet goes on')).assignee === 'kael',
    );
  });
});
