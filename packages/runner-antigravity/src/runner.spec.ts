// The adapter end to end against fake-agy.mjs: the files a session runs on, agy's argv and env, the real hook
// reached through the generated shim, each recorded stream replayed into a RunResult, and the refusals.
import { readFileSync, readdirSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FIXTURES, HOOK_SOURCE, fakeRunner, openWorld, request } from './__fixtures__/agy.ts';
import { ANTIGRAVITY_CAPABILITIES, agyEnv } from './runner.ts';
import type { World } from './__fixtures__/agy.ts';
import type { RunResult, RunnerSignal, RunningSession } from '@elvaria/runner-core';

let world: World;
let log: string;
beforeEach(async () => {
  world = await openWorld();
  log = path.join(world.root, 'agy-calls.jsonl');
});
afterEach(() => world.remove());

async function play(session: RunningSession): Promise<{ result: RunResult; signals: RunnerSignal[] }> {
  const signals: RunnerSignal[] = [];
  for await (const signal of session.signals) signals.push(signal);
  return { result: await session.wait(), signals };
}

const spawn = async (env: Record<string, string> = {}, extra: Parameters<typeof request>[2] = {}) =>
  play(await fakeRunner().spawn(request(world, { ELVARIA_FAKE_AGY_LOG: log, ...env }, extra)));

const replay = (fixture: string, exit = 0, extra: Parameters<typeof request>[2] = {}) =>
  spawn({ ELVARIA_FAKE_AGY_REPLAY: fixture, ELVARIA_FAKE_AGY_EXIT: String(exit) }, extra);

const calls = () =>
  readFileSync(log, 'utf8')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as { argv: string[]; auto_update?: string; path_head: string });

interface Line {
  readonly type: string;
  readonly session?: string;
  readonly data: Record<string, unknown>;
}

const eventLines = (): Line[] => {
  const dir = path.join(world.root, 'events');
  return readdirSync(dir).flatMap((file) =>
    readFileSync(path.join(dir, file), 'utf8')
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line) as Line),
  );
};
const eventTypes = (): string[] => eventLines().map(({ type }) => type);

describe('a session', () => {
  it('runs on generated files: settings, policy, hooks.json, its shim, GEMINI.md, the version', async () => {
    await mkdir(path.join(world.plot, '.claude', 'rules'), { recursive: true });
    await writeFile(path.join(world.plot, 'CLAUDE.md'), '# Law\n', 'utf8');
    await writeFile(path.join(world.plot, '.claude', 'rules', 'api.md'), '# API\n', 'utf8');
    await spawn();
    const read = (...parts: string[]) => readFile(path.join(...parts), 'utf8');
    const settings = JSON.parse(await read(world.run_dir, 'settings.json')) as {
      permissions: { allow: string[] };
    };
    const letter = world.handover.replaceAll('\\', '/');
    expect(settings.permissions.allow).toEqual([
      'write_file(./)',
      'command(git status)',
      `read_file(${letter})`,
      `write_file(${letter})`,
    ]);
    expect(JSON.parse(await read(world.run_dir, 'policy.json'))).toMatchObject({
      version: 1,
      quest: 'q_20261107_a9yb2k',
      attempt: 1,
      character: 'quill',
      role: 'assignee',
      model: 'gemini-3.8-flash-low',
      laws: { forbidden_paths: ['.env', '.env.*', 'infra/secrets/**'] },
    });
    expect(await read(world.plot, '.agents', 'hooks.json')).toContain('"node elvaria-hook.mjs PreToolUse"');
    expect(await read(world.plot, '.agents', 'elvaria-hook.mjs')).toContain(
      JSON.stringify(path.join(world.run_dir, 'policy.json')),
    );
    const context = await read(world.plot, 'GEMINI.md');
    expect(context).toContain('You are Quill, a Scribe.');
    expect(context).toContain('@[Territory law](./CLAUDE.md)\n@[rule](./.claude/rules/api.md)');
    expect(await read(world.run_dir, 'agy-version.txt')).toBe('1.5.2\n');
  });

  it('calls agy with the argv of §3.7, the updater off and Elvaria’s Node first on PATH', async () => {
    const schema = { type: 'object', properties: { verdict: { type: 'string' } } };
    await spawn({}, { resume: { session_id: 'c0ffee' }, structured: schema });
    const all = calls();
    expect(all.map(({ argv }) => (argv[0] === '-p' ? argv[1] : argv[0]))).toEqual([
      '--version',
      '/hooks',
      'Write the release notes.',
    ]);
    const { argv } = all[2] ?? { argv: [] };
    expect(argv).toEqual([
      ...[
        '-p',
        'Write the release notes.',
        '--output-format',
        'stream-json',
        '--model',
        'gemini-3.8-flash-low',
      ],
      ...['--settings', path.join(world.run_dir, 'settings.json'), '--print-timeout', '10m'],
      ...[
        '--log-file',
        path.join(world.run_dir, 'agy.log'),
        '--json-schema',
        path.join(world.run_dir, 'schema.json'),
      ],
      ...['--conversation', 'c0ffee'],
    ]);
    expect(
      all.every(
        ({ auto_update, path_head }) =>
          auto_update === 'true' && path_head === path.dirname(process.execPath),
      ),
    ).toBe(true);
    expect(JSON.parse(await readFile(path.join(world.run_dir, 'schema.json'), 'utf8'))).toEqual(schema);
  });

  it('meets the real hook through the shim: the push is refused by the law, the session goes on', async () => {
    const { result, signals } = await spawn({ ELVARIA_FAKE_SCENARIO: 'forbidden_command' });
    expect(result).toMatchObject({ outcome: 'completed', exit_code: 0, rate_limited: false });
    expect(result.permission_denials).toEqual([{ tool: 'run_command', detail: 'git push origin HEAD' }]);
    const blocked = signals.find(({ kind }) => kind === 'tool_blocked');
    expect(blocked).toMatchObject({
      reason: expect.stringMatching(/^tool call denied by pre-tool hook: Elvaria law/) as unknown,
    });
    // The hook writes the first two; the runner writes the end, which only the stream knows.
    expect(eventTypes()).toEqual(['agent.session.start', 'agent.tool.blocked', 'agent.session.end']);
    expect(eventLines().at(-1)).toMatchObject({
      session: result.session_id,
      data: { outcome: 'completed', usage: { tokens: 1000, turns: 1 } },
    });
  });

  it('keeps what agy printed in the run folder, and writes the end of a killed run', async () => {
    const session = await fakeRunner().spawn(request(world, { ELVARIA_FAKE_SCENARIO: 'hang' }));
    await session.session_id;
    await session.kill('the Steward stopped it');
    const result = await session.wait();
    expect(result.outcome).toBe('killed');
    const stdout = await readFile(path.join(world.run_dir, 'stdout.jsonl'), 'utf8');
    expect(stdout.split('\n')[0]).toContain('"event":"init"');
    const stderr = await readFile(path.join(world.run_dir, 'stderr.log'), 'utf8');
    expect(stderr).toContain('[elvaria] killed: the Steward stopped it');
    expect(eventLines().at(-1)).toMatchObject({ type: 'agent.session.end', data: { outcome: 'killed' } });
  });
});

describe('a recorded run, replayed', () => {
  it.each<[string, number, Partial<RunResult>]>([
    ['stream-minimal.jsonl', 0, { outcome: 'completed', usage: { tokens: 7087, turns: 1 } }],
    [
      'stream-full-run.jsonl',
      0,
      {
        outcome: 'completed',
        usage: { tokens: 75_394, turns: 9 },
        structured: { notes: expect.any(String) as unknown, verdict: 'pass' },
      },
    ],
    ['stream-soft-deny-ends-run.jsonl', 0, { outcome: 'error', exit_code: 0 }],
    ['stream-print-timeout.jsonl', 3, { outcome: 'budget', exit_code: 3, rate_limited: false }],
    ['constructed-rate-limit.jsonl', 3, { outcome: 'error', exit_code: 3, rate_limited: true }],
    ['json-error-bad-model.jsonl', 1, { outcome: 'error', exit_code: 1, usage: { tokens: 0, turns: 0 } }],
  ])('%s (exit %i)', async (fixture, exit, expected) => {
    expect((await replay(fixture, exit)).result).toMatchObject(expected);
  });

  it('signals a rate limit with what agy said', async () => {
    const { signals } = await replay('constructed-rate-limit.jsonl', 3);
    expect(signals.at(-1)).toEqual({
      kind: 'rate_limit',
      detail: expect.stringMatching(/^You have exhausted/) as unknown,
    });
  });

  it('names a run that never started', async () => {
    const { result } = await replay('json-error-bad-model.jsonl', 1);
    expect(result.session_id).toMatch(/^agy-unstarted-\d+$/);
  });

  it('stops a run past budget.max_turns', async () => {
    const budget = { max_turns: 3, max_minutes: 10 };
    const { result } = await replay('stream-full-run.jsonl', 0, { budget });
    expect(result).toMatchObject({ outcome: 'max_turns', exit_code: null });
    // The fake prints everything at once, so the kill may land after more turns were read: at least the 4th.
    expect(result.usage.turns).toBeGreaterThanOrEqual(3);
  });

  it('lets a run whose last allowed turn answers end on its own', async () => {
    const budget = { max_turns: 1, max_minutes: 10 };
    const { result } = await replay('stream-minimal.jsonl', 0, { budget });
    expect(result).toMatchObject({ outcome: 'completed', exit_code: 0, usage: { turns: 1 } });
  });
});

describe('what the adapter refuses', () => {
  it('a tribe whose terms are not acknowledged (ADR 0018)', async () => {
    const runner = fakeRunner({ terms_acknowledged_at: undefined });
    await expect(runner.spawn(request(world))).rejects.toThrow(/acknowledged the Antigravity terms/);
  });

  it("a plot with the territory's own hooks.json, which it leaves as it was", async () => {
    const own = path.join(world.plot, '.agents', 'hooks.json');
    await mkdir(path.dirname(own), { recursive: true });
    await writeFile(own, '{"lint": {}}', 'utf8');
    await expect(fakeRunner().spawn(request(world))).rejects.toThrow(/belongs to the territory/);
    expect(await readFile(own, 'utf8')).toBe('{"lint": {}}');
  });

  it('a session among hooks Elvaria does not control', async () => {
    const env = { ELVARIA_FAKE_AGY_GLOBAL_HOOK: path.join(world.root, 'hooks.json') };
    await expect(fakeRunner().spawn(request(world, env))).rejects.toThrow(/does not control: mine/);
  });
});

describe('probe and doctor', () => {
  it('probe reads /usage: ok, rate limited, or an error', async () => {
    const read = await fakeRunner().probe({ ping: false });
    expect(read).toMatchObject({ status: 'ok' });
    expect(read.windows).toHaveLength(5);
    const usage = JSON.parse(readFileSync(path.join(FIXTURES, 'usage-json.jsonl'), 'utf8')) as {
      command: { data: { groups: { buckets: { remaining_fraction: number }[] }[] } };
    };
    for (const bucket of usage.command.data.groups[0]?.buckets ?? []) bucket.remaining_fraction = 0;
    const empty = path.join(world.root, 'usage-empty.json');
    await writeFile(empty, JSON.stringify(usage), 'utf8');
    const env = (extra: Record<string, string>) => ({ ...agyEnv(fakeRunnerEnv(), undefined), ...extra });
    expect(await fakeRunner({ env: env({ ELVARIA_FAKE_AGY_USAGE: empty }) }).probe()).toMatchObject({
      status: 'rate_limited',
    });
    const broken = await fakeRunner({ env: env({ ELVARIA_FAKE_AGY_USAGE: 'missing.json' }) }).probe();
    expect(broken.status).toBe('error');
  });

  it('doctor names the CLI, its version, and whether it may run', async () => {
    expect(await fakeRunner().doctor()).toEqual({ path: process.execPath, version: '1.5.2', auth_ok: true });
    const refused = await fakeRunner({ terms_acknowledged_at: undefined }).doctor();
    expect(refused).toMatchObject({ auth_ok: false, detail: expect.stringMatching(/ADR 0018/) as unknown });
    const gone = await fakeRunner({
      launch: { command: path.join(world.root, 'no-agy.exe'), args: [] },
    }).doctor();
    expect(gone).toMatchObject({
      version: 'unknown',
      auth_ok: false,
      detail: expect.stringMatching(/agy models failed/) as unknown,
    });
  });

  it('declares what agy 1.5.2 can do: resume yes, sub-agents no', () => {
    expect(ANTIGRAVITY_CAPABILITIES).toMatchObject({ resume: true, subagent: false, tool_gate: true });
    expect(HOOK_SOURCE.endsWith(path.join('hooks', 'src', 'elvaria-hook.ts'))).toBe(true);
  });
});

function fakeRunnerEnv(): Record<string, string> {
  return request(world).env;
}

describe('agyEnv', () => {
  it('turns the updater off with `true` and puts Node first on the PATH the env already has', () => {
    expect(agyEnv({ Path: 'C:\\Windows' }, 'C:\\node')).toEqual({
      Path: `C:\\node${path.delimiter}C:\\Windows`,
      AGY_CLI_DISABLE_AUTO_UPDATE: 'true',
    });
    expect(agyEnv({}, '/opt/node/bin')).toEqual({
      PATH: '/opt/node/bin',
      AGY_CLI_DISABLE_AUTO_UPDATE: 'true',
    });
    expect(agyEnv({ PATH: '/bin' }, undefined)).toEqual({
      PATH: '/bin',
      AGY_CLI_DISABLE_AUTO_UPDATE: 'true',
    });
  });

  it("drops git's variables and lays the session context over the given env", () => {
    const given = { PATH: '/bin', GIT_DIR: '/repo/.git', git_index_file: 'x', ELVARIA_ROLE: 'wrong' };
    expect(agyEnv(given, undefined, { ELVARIA_ROLE: 'assignee' })).toEqual({
      PATH: '/bin',
      ELVARIA_ROLE: 'assignee',
      AGY_CLI_DISABLE_AUTO_UPDATE: 'true',
    });
  });
});
