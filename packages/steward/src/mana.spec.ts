// Mana and revival with FakeRunner (implementation-plan §3.5, §8 P1-05): a usage limit puts the pool to sleep, the
// probe finds the mana back, the same character goes on with the same attempt; an answer in time resumes the
// asking session, a late one starts fresh from the letter.
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { KINGDOM, bench, questPayload, tickUntil, wakesAfter } from './__fixtures__/kingdom.ts';
import type { Bench, BenchOptions } from './__fixtures__/kingdom.ts';
import type { Steward, StewardDeps } from './types.ts';
import type { Event } from '@elvaria/domain';
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

const lines = async (kingdom: Bench): Promise<readonly Event[]> =>
  (await openEventLog(kingdom.root).read()).events;
const typesOf = async (kingdom: Bench) => (await lines(kingdom)).map(({ type }) => type);
const statusOf = async (kingdom: Bench, title: string) => (await kingdom.quest(title)).status;

describe('a usage limit in the middle of a quest', () => {
  it('sleeps the pool, probes it every interval, then the same character goes on with the same attempt', async () => {
    const { kingdom, steward } = await open({
      plays: { work: { 'Hits the limit': ['rate_limit', 'submit'] } },
      probes: { claude: wakesAfter(1) },
    });
    await kingdom.command('create_quest', questPayload('Hits the limit'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await statusOf(kingdom, 'Hits the limit')) === 'paused_mana',
    );
    expect(await kingdom.character('kael')).toMatchObject({
      status: 'sleeping_mana',
      status_before_sleep: 'working',
    });
    // The whole pool sleeps: idle characters of the tribe too, not those of the other tribe.
    expect(await kingdom.character('thorn')).toMatchObject({
      status: 'sleeping_mana',
      status_before_sleep: 'idle',
    });
    expect((await kingdom.character('wren')).status).toBe('idle');
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await statusOf(kingdom, 'Hits the limit')) === 'done',
    );
    const quest = await kingdom.quest('Hits the limit');
    expect(quest).toMatchObject({ assignee: 'kael', attempts: 1 });
    expect(
      quest.attempt_log.filter(({ role }) => role === 'assignee').map(({ n, outcome }) => [n, outcome]),
    ).toEqual([
      [1, 'paused'],
      [1, 'submitted'],
    ]);
    const types = await typesOf(kingdom);
    expect(types.filter((type) => type.startsWith('mana.'))).toEqual([
      'mana.level',
      'mana.exhausted',
      'mana.probe',
      'mana.probe',
      'mana.restored',
    ]);
    const probes = (await lines(kingdom)).filter(({ type }) => type === 'mana.probe').map(({ ts }) => ts);
    expect(probes.map((ts) => ts.slice(11, 16))).toEqual(['09:16', '09:31']);
    expect((await kingdom.character('thorn')).status).toBe('idle');
    // Revival is a fresh session from the letter (resume_after_mana is off by default).
    const revived = kingdom.fakes.claude.requests.filter(({ role }) => role === 'assignee').at(-1);
    expect(revived?.resume).toBeUndefined();
    expect(revived?.prompt.user).toContain(quest.title);
  });

  it('pauses every session of the pool, and wakes both quests when the mana is back', async () => {
    const { kingdom, steward } = await open({
      plays: { work: { 'Runs dry': ['rate_limit', 'submit'], 'Was running': ['hang', 'submit'] } },
      probes: { claude: wakesAfter(0) },
    });
    await kingdom.command('create_quest', questPayload('Runs dry'));
    await kingdom.command('create_quest', questPayload('Was running', { rank: 'E' }));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await statusOf(kingdom, 'Was running')) === 'paused_mana',
    );
    expect(await statusOf(kingdom, 'Runs dry')).toBe('paused_mana');
    const held = (await kingdom.quests()).map(({ assignee }) => assignee).sort();
    for (const id of held) expect((await kingdom.character(id!)).status_before_sleep).toBe('working');
    await tickUntil(steward, kingdom.clock, async () =>
      (await kingdom.quests()).every(({ status }) => status === 'done'),
    );
    expect((await kingdom.quests()).map(({ attempts }) => attempts)).toEqual([1, 1]);
  });

  it('lets a verifier that runs dry leave the review, and the next verifier take it once the pool wakes', async () => {
    /** Only the first verifier session runs dry. */
    const dryOnce = (runner: AgentRunner): AgentRunner => {
      let dried = false;
      const spawn: AgentRunner['spawn'] = async (req) => {
        const session = await runner.spawn(req);
        if (req.role !== 'verifier' || dried) return session;
        dried = true;
        return { ...session, wait: async () => ({ ...(await session.wait()), rate_limited: true }) };
      };
      return { ...runner, spawn };
    };
    const cast = [
      { id: 'kael', cls: 'knight' },
      { id: 'sable', cls: 'judge', model: 'claude-opus-5-5', level: 6 },
    ];
    const { kingdom, steward } = await open({ cast, probes: { claude: wakesAfter(0) } }, (k) => ({
      runners: { claude: dryOnce(k.runners.claude) },
    }));
    await kingdom.command('create_quest', questPayload('Judged twice'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.character('sable')).status === 'sleeping_mana',
    );
    expect(await kingdom.quest('Judged twice')).toMatchObject({ status: 'review', verifier: null });
    expect((await kingdom.character('sable')).status_before_sleep).toBe('idle');
    await tickUntil(steward, kingdom.clock, async () => (await statusOf(kingdom, 'Judged twice')) === 'done');
    const verifiers = (await kingdom.quest('Judged twice')).attempt_log.filter(
      ({ role }) => role === 'verifier',
    );
    expect(verifiers.map(({ outcome }) => outcome)).toEqual(['paused', 'submitted']);
  });

  it('continues the paused session itself when resume_after_mana is on', async () => {
    const { kingdom, steward } = await open({
      plays: { work: { 'Hits the limit': ['rate_limit', 'submit'] } },
    });
    await kingdom.store.kingdom.write({
      ...KINGDOM,
      dispatch: { ...KINGDOM.dispatch, resume_after_mana: true },
    });
    await kingdom.command('create_quest', questPayload('Hits the limit'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await statusOf(kingdom, 'Hits the limit')) === 'review',
    );
    const [first, second] = kingdom.fakes.claude.requests.filter(({ role }) => role === 'assignee');
    const paused = (await kingdom.quest('Hits the limit')).attempt_log[0]?.session_id;
    expect(paused).toBeDefined();
    expect(first?.resume).toBeUndefined();
    expect(second?.resume).toEqual({ session_id: paused });
    // The resumed session still holds the quest: its prompt only says it goes on.
    expect(second?.prompt.user).toMatch(/^# Going on/);
    expect(second?.prompt.user).not.toContain('The owner answered');
  });
});

describe('the gauges', () => {
  /** A runner whose sessions report the account's windows in band first, as Claude's rate_limit_event does. */
  const reporting = (runner: AgentRunner, used: number): AgentRunner => ({
    ...runner,
    spawn: async (req) => {
      const session = await runner.spawn(req);
      const report: RunnerSignal = { kind: 'mana', windows: [{ window: 'five_hour', used_pct: used }] };
      async function* signals() {
        yield report;
        yield* session.signals;
      }
      return { ...session, signals: signals() };
    },
  });

  it('closes a pool at the cap: running work ends, no new quest is taken', async () => {
    const { kingdom, steward } = await open({}, (k) => ({
      runners: { claude: reporting(k.runners.claude, 99), gemini: k.runners.gemini },
    }));
    await kingdom.command('create_quest', questPayload('First'));
    await tickUntil(steward, kingdom.clock, async () => (await statusOf(kingdom, 'First')) === 'done');
    await kingdom.command('create_quest', questPayload('Second'));
    for (let tick = 0; tick < 3; tick += 1) await steward.tick();
    expect(await statusOf(kingdom, 'Second')).toBe('open');
    const level = (await lines(kingdom)).find(({ type }) => type === 'mana.level');
    expect(level?.data).toEqual({
      tribe: 'claude',
      pool: 'claude',
      window: 'five_hour',
      used_pct: 99,
      source: 'rate_limits',
    });
  });

  it('reads the awake pools without a ping, and sleeps one whose window reads spent', async () => {
    const calls: boolean[] = [];
    const spent = (options: ProbeOptions): ProbeResult => {
      calls.push(options.ping ?? true);
      return calls.length === 1
        ? {
            status: 'rate_limited',
            windows: [{ window: 'weekly', used_pct: 100, resets_at: '2026-11-08T13:00:00Z' }],
          }
        : { status: 'ok' };
    };
    const { kingdom, steward } = await open({ probes: { claude: spent } });
    await kingdom.command('create_quest', questPayload('Waits for the week'));
    await steward.tick();
    expect(calls).toEqual([false]);
    expect(await statusOf(kingdom, 'Waits for the week')).toBe('open');
    expect((await typesOf(kingdom)).filter((type) => type.startsWith('mana.'))).toEqual([
      'mana.level',
      'mana.level',
      'mana.exhausted',
    ]);
    // Asleep until the reset it read: the owner's `wake` probes at once, and the ping goes through.
    await kingdom.command('wake', { tribe: 'claude' });
    await steward.tick();
    expect(calls).toEqual([false, true]);
    expect((await typesOf(kingdom)).filter((type) => type.startsWith('mana.')).slice(-2)).toEqual([
      'mana.probe',
      'mana.restored',
    ]);
  });

  it('refuses a wake for a tribe it does not know or cannot run', async () => {
    const { kingdom, steward } = await open({}, (k) => ({ runners: { claude: k.runners.claude } }));
    await kingdom.command('wake', { tribe: 'codex' });
    await kingdom.command('wake', { tribe: 'gemini' });
    await steward.tick();
    const answers = (await lines(kingdom))
      .filter(({ type }) => type === 'command.rejected')
      .map(({ data }) => (data as { reason?: string }).reason);
    expect(answers).toEqual(['unknown_tribe', 'no_runner']);
  });

  it('knows after a restart which pools sleep, and probes them at once', async () => {
    const { kingdom, steward } = await open({
      plays: { work: { 'Hits the limit': ['rate_limit', 'submit'] } },
      probes: { claude: wakesAfter(0) },
    });
    await kingdom.command('create_quest', questPayload('Hits the limit'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await statusOf(kingdom, 'Hits the limit')) === 'paused_mana',
    );
    await steward.stop();
    running = kingdom.steward();
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    await running.tick();
    expect((await typesOf(kingdom)).filter((type) => type.startsWith('mana.')).slice(-2)).toEqual([
      'mana.probe',
      'mana.restored',
    ]);
  });
});
