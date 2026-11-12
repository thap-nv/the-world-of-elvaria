// The adapter end to end against fake-codex.mjs: recorded streams replayed (spike Codex 2026-11-12), the hooks check
// before the trust bypass, the territory's own AGENTS.override.md, resume, the prompt on stdin, doctor and probe.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { RunResult, RunnerSignal, SpawnRequest } from '@elvaria/runner-core';

import { FAKE_CODEX, fakeRunner, minimalEnv, openWorld, request } from './__fixtures__/codex.ts';
import { CONTEXT_FILE } from './context-file.ts';
import { NOT_SIGNED_IN } from './doctor.ts';
import { SHELL_POLICY_ENV } from './runner.ts';
import type { World } from './__fixtures__/codex.ts';

let world: World;
beforeEach(async () => {
  world = await openWorld();
});
afterEach(() => world.remove());

async function run(req: SpawnRequest): Promise<{ result: RunResult; signals: RunnerSignal[] }> {
  const session = await fakeRunner().spawn(req);
  const signals: RunnerSignal[] = [];
  for await (const signal of session.signals) signals.push(signal);
  return { result: await session.wait(), signals };
}

const replaying = (fixture: string, exit = 0) => ({
  ELVARIA_FAKE_CODEX_REPLAY: fixture,
  ELVARIA_FAKE_CODEX_EXIT: String(exit),
});

describe('a session', () => {
  it('turns a structured answer into RunResult.structured', async () => {
    const req = request(world, replaying('stream-structured.jsonl'), { structured: { type: 'object' } });
    const { result } = await run(req);
    expect(result).toMatchObject({
      outcome: 'completed',
      exit_code: 0,
      session_id: '01a1cf9e-8df5-7370-94a1-9154929c9ed2',
      structured: { result: 'pass', notes: 'AGENTS.md names a flower: TULIP.' },
      rate_limited: false,
    });
    expect(await readFile(path.join(world.run_dir, 'schema.json'), 'utf8')).toContain('"object"');
  });

  it('pauses for mana when the account ran out of usage', async () => {
    const { result, signals } = await run(request(world, replaying('constructed-usage-limit.jsonl', 1)));
    expect(result).toMatchObject({ outcome: 'error', rate_limited: true });
    expect(signals).toContainEqual({
      kind: 'rate_limit',
      detail: expect.stringMatching(/usage limit/) as unknown,
    });
  });

  it("lists the hook's refusals, read from stderr, and the session goes on", async () => {
    const { result, signals } = await run(request(world, replaying('stream-hooks.jsonl')));
    expect(result.outcome).toBe('completed');
    expect(result.permission_denials).toEqual([{ tool: 'Bash', detail: 'git push origin main' }]);
    expect(signals).toContainEqual({
      kind: 'tool_blocked',
      tool: 'Bash',
      reason: 'Elvaria law of this territory: git push is forbidden.',
    });
    expect(result.usage.tokens).toBeGreaterThan(0);
  });

  it('stops past budget.max_turns', async () => {
    const req = request(world, replaying('stream-commands.jsonl'), {
      budget: { max_turns: 2, max_minutes: 5 },
    });
    const { result } = await run(req);
    expect(result).toMatchObject({ outcome: 'max_turns', exit_code: null });
  });

  it('reads the prompt on stdin, continues a session by id, and leaves no AGENTS.override.md behind', async () => {
    const log = path.join(world.root, 'calls.jsonl');
    const req = request(world, { ELVARIA_FAKE_CODEX_LOG: log }, { resume: { session_id: 'thread-7' } });
    const { result } = await run(req);
    expect(result).toMatchObject({ outcome: 'completed', session_id: 'thread-7' });
    const calls = (await readFile(log, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { argv: string[]; prompt_chars?: number });
    const session = calls.find((call) => call.argv[0] === 'exec');
    expect(session?.argv.slice(0, 2)).toEqual(['exec', 'resume']);
    expect(session?.prompt_chars).toBe(req.prompt.user.length);
    expect(existsSync(path.join(world.plot, CONTEXT_FILE))).toBe(false);
  });

  it("sets PowerShell's policy for the session's commands on Windows only, where mxc cannot read it (P1-12e)", async () => {
    const log = path.join(world.root, 'calls.jsonl');
    await run(request(world, { ELVARIA_FAKE_CODEX_LOG: log }));
    const calls = (await readFile(log, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { argv: string[]; ps_policy?: string });
    const session = calls.find((call) => call.argv[0] === 'exec');
    expect(session?.ps_policy).toBe(
      process.platform === 'win32' ? SHELL_POLICY_ENV.PSExecutionPolicyPreference : undefined,
    );
    expect(SHELL_POLICY_ENV).toEqual({ PSExecutionPolicyPreference: 'RemoteSigned' });
  });
});

describe('before a session', () => {
  it("refuses to bypass trust when Codex would run a hook that is not Elvaria's, and cleans up", async () => {
    await expect(fakeRunner().spawn(request(world, { ELVARIA_FAKE_CODEX_USER_HOOK: '1' }))).rejects.toThrow(
      /not Elvaria's, without review/,
    );
    expect(existsSync(path.join(world.plot, CONTEXT_FILE))).toBe(false);
  });

  it("refuses a plot whose AGENTS.override.md is the territory's, and leaves it alone", async () => {
    const own = path.join(world.plot, CONTEXT_FILE);
    await writeFile(own, '# the territory own override\n', 'utf8');
    await expect(fakeRunner().spawn(request(world))).rejects.toThrow(/belongs to the territory/);
    expect(await readFile(own, 'utf8')).toBe('# the territory own override\n');
  });

  it('refuses when the hooks cannot be checked', async () => {
    const runner = fakeRunner({ launch: { command: process.execPath, args: ['-e', 'process.exit(3)'] } });
    await expect(runner.spawn(request(world))).rejects.toThrow(
      /could not be checked: codex app-server left early/,
    );
  });
});

describe('doctor and probe', () => {
  it('names the CLI and its version, and checks the sign-in and the built hook', async () => {
    expect(await fakeRunner().doctor()).toEqual({
      path: process.execPath,
      version: '0.167.0-alpha.4.1',
      auth_ok: true,
    });
    const out = await fakeRunner({ env: { ...minimalEnv(), ELVARIA_FAKE_CODEX_LOGGED_OUT: '1' } }).doctor();
    expect(out).toMatchObject({ auth_ok: false, detail: NOT_SIGNED_IN });
    const missing = path.join(world.root, 'dist', 'elvaria-hook.js');
    const unbuilt = await fakeRunner({ hook: { command: process.execPath, args: [missing] } }).doctor();
    expect(unbuilt.detail).toMatch(/the Elvaria hook is not built/);
  });

  it("reads the account's windows without a model call", async () => {
    expect(await fakeRunner().probe()).toMatchObject({
      status: 'ok',
      windows: [{ window: 'five_hour' }, { window: 'weekly' }],
    });
    const gone = fakeRunner({ launch: { command: path.join(world.root, 'no codex'), args: [] } });
    expect(await gone.probe()).toMatchObject({
      status: 'error',
      detail: expect.stringMatching(/did not start/) as unknown,
    });
  });
});

it('the fake CLI refuses the flags Elvaria never passes', async () => {
  await mkdir(path.join(world.root, 'x'), { recursive: true });
  const { spawnSync } = await import('node:child_process');
  const ran = spawnSync(process.execPath, [FAKE_CODEX, 'exec', '--json', '-m', 'm', '--ephemeral', '-'], {
    encoding: 'utf8',
    input: 'hi',
  });
  expect(ran.status).toBe(2);
  expect(ran.stderr).toMatch(/never passes --ephemeral/);
});
