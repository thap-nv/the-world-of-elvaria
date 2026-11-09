// The fake CLI and the fake hook read stdin as the real hook does (fixtures/read-stdin.mjs, P1-36), and the fake hook
// denies a PreToolUse it cannot read, as the real one does (ADR 0007).
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import type { Workspace } from '@elvaria/runner-core';
import { afterEach, describe, expect, it } from 'vitest';

import { FAKE_HOOK, FIXTURES, SPEC_REPEATS, prepare } from './__fixtures__/harness.ts';
import { PRE_TOOL_USE_ARGS } from './settings.ts';

/**
 * A preload that opens fd 0 as a libuv pipe, non-blocking on POSIX: what the runner's spawn left on macOS, where a
 * read of a pipe the runner was still writing failed with EAGAIN. In NODE_OPTIONS it reaches the fake CLI and,
 * through the env the fake CLI hands its hooks, the fake hook.
 */
const NON_BLOCKING_STDIN = '--import=data:text/javascript,process.stdin';

const opened: Workspace[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((workspace) => workspace.remove()));
});

describe('a session on a stdin left non-blocking', () => {
  it('gives the fake CLI a prompt larger than any pipe buffer whole', { repeats: SPEC_REPEATS }, async () => {
    const prepared = await prepare('submit', {}, { env: { NODE_OPTIONS: NON_BLOCKING_STDIN } });
    opened.push(prepared.workspace);
    const record = path.join(prepared.workspace.root, 'record.json');
    // Bigger than a socket buffer on macOS (8 KiB) and on Linux (~200 KiB): the runner writes it in many pieces.
    const user = `${prepared.request.prompt.user}\n${'Thả quái thử thành. '.repeat(40_000)}`;
    const session = await prepared.runner.spawn({
      ...prepared.request,
      env: { ...prepared.request.env, FAKE_CLAUDE_RECORD: record },
      prompt: { ...prepared.request.prompt, user },
    });
    const reading = (async () => {
      for await (const signal of session.signals) expect(signal).toBeDefined();
    })();
    const result = await session.wait();
    await reading;
    const seen = JSON.parse(await readFile(record, 'utf8')) as { prompt: string };
    expect(seen.prompt).toBe(user);
    // The fake hook read its payloads on the same kind of stdin: SessionStart was recorded, the session completed.
    expect(result.outcome).toBe('completed');
  });
});

interface StdinSource {
  readonly read: (buffer: Buffer) => number;
  readonly wait: (ms: number) => void;
}

/** A fixture in plain JS, outside this package's TypeScript project: loaded by URL, typed here. */
const reader = async () =>
  (await import(pathToFileURL(path.join(FIXTURES, 'read-stdin.mjs')).href)) as {
    readStdin: (source: StdinSource) => string;
  };

describe('stdin of the fakes', () => {
  it('keeps what was read before EAGAIN and reads the rest after it', async () => {
    const { readStdin } = await reader();
    const steps = ['You are Ser Lan', 'EAGAIN', 'EAGAIN', 'h, a knight.'];
    const waits: number[] = [];
    const source: StdinSource = {
      read: (buffer) => {
        const step = steps.shift();
        if (step === undefined) return 0;
        if (step === 'EAGAIN') throw Object.assign(new Error('EAGAIN'), { code: 'EAGAIN' });
        return Buffer.from(step, 'utf8').copy(buffer);
      },
      wait: (ms) => waits.push(ms),
    };
    expect(readStdin(source)).toBe('You are Ser Lanh, a knight.');
    expect(waits).toEqual([1, 1]);
    const broken: StdinSource = {
      read: () => {
        throw Object.assign(new Error('EBADF'), { code: 'EBADF' });
      },
      wait: () => undefined,
    };
    expect(() => readStdin(broken)).toThrow('EBADF');
  });

  it('the fake hook denies a PreToolUse it cannot read and passes any other event', () => {
    const hook = (input: string, args: readonly string[]) =>
      spawnSync(process.execPath, [FAKE_HOOK, ...args], { input, encoding: 'utf8' });
    const denied = hook('', PRE_TOOL_USE_ARGS);
    expect(denied.status).toBe(0);
    expect(JSON.parse(denied.stdout)).toMatchObject({ hookSpecificOutput: { permissionDecision: 'deny' } });
    expect(hook('{"hook_event_name":', [])).toMatchObject({ status: 0, stdout: '' });
    expect(hook('', ['--event', 'Stop'])).toMatchObject({ status: 0, stdout: '' });
  });
});
