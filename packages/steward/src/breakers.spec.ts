// The breakers in the Steward (implementation-plan §3.4, §8 P1-06): a hung FakeRunner session goes to the infirmary
// on the very minute its time runs out, with the swamp, a WIP commit and the bell; tokens past the budget trip the
// same way; a verifier past its time leaves the review; a pause for mana commits the work too; and the pids of the
// sessions in `.state/` let a restarted Steward kill what a crashed one left running.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { openEventLog } from '@elvaria/eventlog';
import { POWERSHELL_TIMEOUT_MS, createFakeRunner } from '@elvaria/runner-core';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil, wakesAfter } from './__fixtures__/kingdom.ts';
import { folderPlots } from './plots.ts';
import { SESSIONS_FILE, readPids } from './sessions/pids.ts';
import type { Bench, BenchOptions } from './__fixtures__/kingdom.ts';
import type { Steward, StewardDeps } from './types.ts';
import type { AgentRunner, CommitOutcome, RunnerSignal } from '@elvaria/runner-core';

let current: Bench | undefined;
let running: Steward | undefined;
const children: number[] = [];
/** A pid no process can hold on Windows, Linux or macOS (P1-18 proposal (i)). */
const NO_SUCH_PID = 2_147_483_647;

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
  for (const pid of children.splice(0)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Ended already, as it should have.
    }
  }
});

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const typesOf = async (kingdom: Bench) =>
  (await openEventLog(kingdom.root).read()).events.map(({ type }) => type);

/** Plots that keep each commit message and answer `outcome`. */
const committing =
  (commits: string[], outcome: CommitOutcome = { status: 'committed', sha: 'abc1234' }) =>
  (kingdom: Bench): Partial<StewardDeps> => ({
    plots: {
      ...folderPlots(kingdom.root),
      commit: (_plot, message) => {
        commits.push(message);
        return Promise.resolve(outcome);
      },
    },
  });

/** A runner whose sessions report `tokens` at once, then play their scenario. */
const spending = (fake: AgentRunner, tokens: number): AgentRunner => ({
  ...fake,
  spawn: async (req) => {
    const session = await fake.spawn(req);
    async function* signals(): AsyncGenerator<RunnerSignal> {
      yield { kind: 'usage', tokens };
      yield* session.signals;
    }
    return { ...session, signals: signals() };
  },
});

/** A runner whose sessions end as the CLI's own `--max-turns` ends them. */
const atMaxTurns = (fake: AgentRunner): AgentRunner => ({
  ...fake,
  spawn: async (req) => {
    const session = await fake.spawn(req);
    return { ...session, wait: async () => ({ ...(await session.wait()), outcome: 'max_turns' as const }) };
  },
});

describe('a session past a breaker', () => {
  it('goes to the infirmary on the minute its time runs out: swamp, kill, WIP commit, bell', async () => {
    const commits: string[] = [];
    const { kingdom, steward } = await open({ plays: { work: { Hangs: ['hang'] } } }, committing(commits));
    await kingdom.command('create_quest', questPayload('Hangs'));
    await steward.tick();
    const started = await kingdom.quest('Hangs');
    expect(started.status).toBe('working');
    kingdom.clock.advance(44);
    await steward.tick();
    expect((await kingdom.quest('Hangs')).status).toBe('working');
    kingdom.clock.advance(1);
    await steward.tick();
    const quest = await kingdom.quest('Hangs');
    expect(quest.status).toBe('infirmary');
    expect(quest.attempt_log.at(-1)).toMatchObject({
      outcome: 'timeout',
      ended_at: '2026-11-07T09:45:00+07:00',
    });
    expect(steward.running()).toBe(0);
    expect(commits).toEqual([`chore: wip ${quest.id} (time)`]);
    // Why, in parts too (P1-32): the trip, the breaker's words in the detail; the bell and the line say the same.
    const message = 'ran 45 min, limit 45 min';
    const why = { reason: `breaker:time: ${message}`, trip: 'time', detail: { message } };
    const hangs = { id: quest.id, title: 'Hangs', rank: 'D' };
    expect(kingdom.notices).toEqual([{ kind: 'infirmary', quest: hangs, ...why }]);
    expect((await kingdom.character(started.assignee ?? '')).status).toBe('idle');
    expect((await typesOf(kingdom)).slice(-2)).toEqual(['character.swamp', 'quest.infirmary']);
    const line = (await openEventLog(kingdom.root).read()).events.at(-1);
    expect(line).toMatchObject({ attempt: 1, data: why });
    // The quest waits for the owner: no second bell, no new session.
    kingdom.clock.advance(1);
    await steward.tick();
    expect(kingdom.notices).toHaveLength(1);
    expect(steward.running()).toBe(0);
  });

  it('trips the tokens of a session that spent past the budget', async () => {
    const { kingdom, steward } = await open({ plays: { work: { Spends: ['hang'] } } }, (k) => ({
      runners: { claude: spending(k.runners.claude, 480_001), gemini: k.runners.gemini },
    }));
    await kingdom.command('create_quest', questPayload('Spends'));
    await steward.tick();
    // Rank D: two context budgets since P1-54, times the mana multiplier.
    expect((await kingdom.quest('Spends')).budget.max_tokens).toBe(480_000);
    await pause(20);
    await steward.tick();
    const quest = await kingdom.quest('Spends');
    expect(quest.status).toBe('infirmary');
    expect(quest.attempt_log.at(-1)?.outcome).toBe('breaker');
    expect(kingdom.notices.at(-1)).toMatchObject({ reason: 'breaker:tokens: 480001 tokens, limit 480000' });
  });

  it('lets a verifier past its time leave the review to the next one, with no bell', async () => {
    const hangingJudge = (tribe: string) =>
      createFakeRunner({
        tribe: tribe as never,
        scenarioOf: (req) => (req.role === 'verifier' ? 'hang' : 'submit'),
      });
    const { kingdom, steward } = await open({}, () => ({
      runners: { claude: hangingJudge('claude'), gemini: hangingJudge('gemini') },
    }));
    await kingdom.command('create_quest', questPayload('Judged slowly'));
    await tickUntil(steward, kingdom.clock, async () => {
      const quest = await kingdom.quest('Judged slowly');
      return quest.status === 'review' && typeof quest.verifier === 'string';
    });
    const judge = (await kingdom.quest('Judged slowly')).verifier ?? '';
    kingdom.clock.advance(45);
    await steward.tick();
    const quest = await kingdom.quest('Judged slowly');
    expect(quest).toMatchObject({ status: 'review', verifier: null });
    expect(quest.attempt_log.at(-1)).toMatchObject({
      role: 'verifier',
      character: judge,
      outcome: 'timeout',
    });
    expect((await kingdom.character(judge)).status).toBe('idle');
    expect(kingdom.notices).toEqual([]);
    expect(kingdom.warnings.join('\n')).toContain(`${judge}'s review stopped, breaker:time: ran 45 min`);
    expect((await typesOf(kingdom)).at(-1)).toBe('quest.verdict');
  });

  it("keeps the work in the plot when the territory's hooks refuse the WIP commit, and says so", async () => {
    const commits: string[] = [];
    const refused = { status: 'refused', detail: 'husky - pre-commit script failed (code 1)' } as const;
    const { kingdom, steward } = await open({}, (k) => ({
      ...committing(commits, refused)(k),
      // The CLI stops itself at --max-turns: the same breaker, met by the CLI.
      runners: { claude: atMaxTurns(k.runners.claude), gemini: k.runners.gemini },
    }));
    await kingdom.command('create_quest', questPayload('Loops'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Loops')).status === 'infirmary',
    );
    const quest = await kingdom.quest('Loops');
    expect(commits).toEqual([`chore: wip ${quest.id} (turns)`]);
    expect(kingdom.notices.at(-1)).toMatchObject({
      reason:
        'breaker:turns (WIP not committed, it stays in the plot: husky - pre-commit script failed (code 1))',
    });
  });
});

describe('a pool out of mana', () => {
  it('commits the work of every session it pauses, after the kill', async () => {
    const commits: string[] = [];
    const { kingdom, steward } = await open(
      {
        plays: { work: { 'Runs dry': ['rate_limit'], 'Was running': ['hang'] } },
        probes: { claude: wakesAfter(99) },
      },
      committing(commits),
    );
    await kingdom.command('create_quest', questPayload('Runs dry'));
    await kingdom.command('create_quest', questPayload('Was running', { rank: 'E' }));
    await tickUntil(steward, kingdom.clock, async () =>
      (await kingdom.quests()).every(({ status }) => status === 'paused_mana'),
    );
    const ids = (await kingdom.quests()).map(({ id }) => id);
    expect(commits.toSorted()).toEqual(ids.map((id) => `chore: wip ${id} (mana)`).toSorted());
  });
});

describe('the pids of the sessions (.state/sessions.json)', () => {
  /** A runner whose sessions say they run as process `pid`. */
  const asProcess = (fake: AgentRunner, pid: number): AgentRunner => ({
    ...fake,
    spawn: async (req) => ({ ...(await fake.spawn(req)), pid }),
  });

  it('keeps the pid of every session held, and none once the Steward stops', async () => {
    const { kingdom, steward } = await open({ plays: { work: { Hangs: ['hang'] } } }, (k) => ({
      runners: { claude: asProcess(k.runners.claude, 4242), gemini: k.runners.gemini },
    }));
    await kingdom.command('create_quest', questPayload('Hangs'));
    await steward.tick();
    const quest = await kingdom.quest('Hangs');
    expect(await readPids(kingdom.root)).toEqual([
      {
        quest: quest.id,
        role: 'assignee',
        character: quest.assignee,
        pid: 4242,
        spawned_at: '2026-11-07T09:00:00+07:00',
      },
    ]);
    await steward.stop();
    running = undefined;
    expect(await readPids(kingdom.root)).toEqual([]);
  });

  // Two cold PowerShells on a Windows CI runner (runner-core's POWERSHELL_TIMEOUT_MS each, at worst).
  it(
    'kills at start the tree a crashed Steward left running, and leaves a pid that is someone else now',
    {
      timeout: 2 * POWERSHELL_TIMEOUT_MS,
    },
    async () => {
      const orphan = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      const pid = orphan.pid ?? 0;
      children.push(pid);
      const exited = new Promise((resolve) => orphan.once('exit', resolve));
      current = await bench();
      const file = path.join(current.root, SESSIONS_FILE);
      await mkdir(path.dirname(file), { recursive: true });
      const left = (quest: string, character: string, at: number, spawnedAt: string) => ({
        quest,
        role: 'assignee',
        character,
        pid: at,
        spawned_at: spawnedAt,
      });
      const sessions = [
        left('q_20261107_aaaaaa', 'kael', pid, new Date().toISOString()),
        // This very process holds that pid now, started long after the session's spawn.
        left('q_20261107_bbbbbb', 'thorn', process.pid, '2026-01-01T00:00:00+07:00'),
        // Gone with its Steward: nothing to kill, nothing to say. Not the pid of a process that just exited: under
        // a busy `pnpm check` the system hands it out again within SAME_PROCESS_MS, and the Steward rightly kills
        // that tree (once a vitest worker). No process ever has this one: Windows pids are multiples of 4, Linux
        // stops at 2^22, macOS below 100 000.
        left('q_20261107_cccccc', 'wren', NO_SUCH_PID, new Date().toISOString()),
      ];
      await writeFile(file, JSON.stringify({ version: 1, sessions }));
      running = current.steward();
      expect(await running.start({ loop: false })).toEqual({ ok: true });
      await exited;
      expect(current.warnings.join('\n')).toContain(
        `q_20261107_aaaaaa: kael's session (pid ${String(pid)}) outlived`,
      );
      expect(current.warnings.join('\n')).toContain('q_20261107_bbbbbb: thorn');
      expect(current.warnings.join('\n')).toContain('belongs to another process; left alone');
      expect(current.warnings.join('\n')).not.toContain('q_20261107_cccccc');
      expect(await readPids(current.root)).toEqual([]);
    },
  );

  it('reads nothing from a torn or foreign record', async () => {
    current = await bench();
    const file = path.join(current.root, SESSIONS_FILE);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, '{"version": 1, "sessions": [{"pid": "x"}');
    expect(await readPids(current.root)).toEqual([]);
    await writeFile(file, JSON.stringify({ version: 2, sessions: [] }));
    expect(await readPids(current.root)).toEqual([]);
    await writeFile(file, JSON.stringify({ version: 1, sessions: [{ quest: 'q', pid: 1 }] }));
    expect(await readPids(current.root)).toEqual([]);
  });
});
