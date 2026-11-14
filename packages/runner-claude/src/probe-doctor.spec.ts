import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { noAnswerWithin } from '@elvaria/runner-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  FAKE_CLAUDE,
  FAKE_HOOK,
  TRIBE,
  fakeHookCommand,
  fakeRunner,
  minimalEnv,
} from './__fixtures__/harness.ts';
import { RM_TEMP } from './__fixtures__/temp.ts';
import { NOT_FOUND, hookMissing, signInEnding, versionOf } from './doctor.ts';
import { launchOf } from './launch.ts';
import { claudeCandidates, locateClaude } from './locate.ts';
import { createClaudeForget, createClaudeRunner } from './runner.ts';

const withEnv = (extra: Record<string, string>) => ({ env: { ...minimalEnv(), ...extra } });

describe('probe', () => {
  it('reads /usage, then pings the cheapest model; the windows it read come back (P1-05)', async () => {
    const result = await fakeRunner().probe();
    expect(result.status).toBe('ok');
    expect(result.windows?.map(({ window, used_pct, model }) => [window, used_pct, model])).toEqual([
      ['five_hour', 49, undefined],
      ['weekly', 56, undefined],
      ['weekly', 54, 'Fable'],
    ]);
  });

  it('only reads /usage when asked not to ping: no model is called (0 mana)', async () => {
    // A ping would fail here; without one the answer is what /usage says.
    const runner = fakeRunner(withEnv({ FAKE_CLAUDE_PING: 'error' }));
    expect((await runner.probe()).status).toBe('error');
    const read = await runner.probe({ ping: false });
    expect(read.status).toBe('ok');
    expect(read.windows).toHaveLength(3);
  });

  it('says so when it may not ping and /usage gave nothing', async () => {
    const result = await fakeRunner({ executable: path.join(tmpdir(), 'no such claude.exe') }).probe({
      ping: false,
    });
    expect(result.status).toBe('error');
  });

  it('stays asleep while a window of the account is full, until the latest reset', async () => {
    const text = [
      'Current session: 100% used · resets Nov 6, 9:50pm (Asia/Bangkok)',
      'Current week (all models): 100% used · resets Nov 8, 8pm (Asia/Bangkok)',
      'Current week (Fable): 100% used · resets Nov 8, 9pm (Asia/Bangkok)',
    ].join('\n');
    // /usage dates have no year: a reset more than a day behind the clock means next year (usage.ts).
    // The clock is pinned to the spike's, so the test does not turn red once these dates pass.
    const now = () => Date.parse('2026-11-06T14:40:00Z');
    const result = await fakeRunner({ ...withEnv({ FAKE_CLAUDE_USAGE_TEXT: text }), now }).probe();
    expect(result).toMatchObject({ status: 'rate_limited', detail: 'usage full: five_hour, weekly' });
    expect(result.resets_at).toBe('2026-11-08T13:00:00.000Z');
  });

  it('pings when only the cap of one model is full: that binds its characters, not the tribe', async () => {
    const text = 'Current session: 10% used\nCurrent week (Fable): 100% used';
    expect(await fakeRunner(withEnv({ FAKE_CLAUDE_USAGE_TEXT: text })).probe()).toMatchObject({
      status: 'ok',
    });
  });

  it('reports a ping that hit a limit (self-built 429) or failed', async () => {
    expect(await fakeRunner(withEnv({ FAKE_CLAUDE_PING: 'rate_limit' })).probe()).toMatchObject({
      status: 'rate_limited',
      detail: 'the ping hit a usage limit',
    });
    const failed = await fakeRunner(withEnv({ FAKE_CLAUDE_PING: 'error' })).probe();
    expect(failed.status).toBe('error');
    expect(failed.detail).toContain('claude-nonexistent-9');
  });

  it('reports a CLI that does not start', async () => {
    const result = await fakeRunner({ executable: path.join(tmpdir(), 'no such claude.exe') }).probe();
    expect(result.status).toBe('error');
    expect(result.detail).toMatch(/ENOENT/);
  });
});

describe('doctor', () => {
  it('names the CLI, its version and the login', async () => {
    expect(await fakeRunner().doctor()).toEqual({ path: FAKE_CLAUDE, version: '2.1.318', auth_ok: true });
    expect(versionOf('2.1.318 (Claude Code)\n')).toBe('2.1.318');
  });

  it('says when the owner is logged out or the hook is not built', async () => {
    const hookScript = path.join(tmpdir(), 'missing', 'elvaria-hook.js');
    const info = await fakeRunner({ ...withEnv({ FAKE_CLAUDE_AUTH: 'logged_out' }), hookScript }).doctor();
    expect(info.auth_ok).toBe(false);
    expect(info.detail).toContain('not logged in');
    expect(info.detail).toContain(hookMissing(hookScript));
  });

  // Windows throws EFTYPE from spawn itself for a file that is no program; doctor must answer, not throw.
  it.runIf(process.platform === 'win32')('answers for a broken executable', async () => {
    const broken = path.join(await mkdtemp(path.join(tmpdir(), 'elvaria broken ')), 'claude.exe');
    await writeFile(broken, '');
    const info = await fakeRunner({ executable: broken }).doctor();
    expect(info).toMatchObject({ path: broken, version: '', auth_ok: false });
    // It never started: doctor says so for both calls, not that the owner is logged out.
    expect(info.detail).toContain(`${broken} --version: `);
    expect(info.detail).toContain('claude auth status --json: ');
    expect(info.detail).not.toContain('not logged in');
    await rm(path.dirname(broken), RM_TEMP);
  });

  it('says `claude auth status` ran out of time, and how long it had, never that the owner is logged out', async () => {
    const info = await fakeRunner({ ...withEnv({ FAKE_CLAUDE_AUTH: 'hangs' }), timeoutMs: 1000 }).doctor();
    expect(info.auth_ok).toBe(false);
    expect(info.detail).toContain(`claude auth status --json: ${noAnswerWithin(1000)}`);
    expect(info.detail).not.toContain('not logged in');
  });

  it('says when it found no CLI at all, and a session cannot start', async () => {
    const runner = createClaudeRunner({
      tribe: TRIBE,
      hookCommand: fakeHookCommand,
      hookScript: FAKE_HOOK,
      env: { PATH: '' },
    });
    expect(await runner.doctor()).toEqual({ path: '', version: '', auth_ok: false, detail: NOT_FOUND });
    expect(await runner.probe()).toEqual({ status: 'error', detail: NOT_FOUND });
  });

  it('warns a week before the sign-in ends', async () => {
    const now = Date.parse('2026-11-10T00:00:00Z');
    const soon = '2026-11-15T15:23:28.735Z';
    const info = await fakeRunner({
      ...withEnv({ FAKE_CLAUDE_LOGIN_EXPIRES: soon }),
      now: () => now,
    }).doctor();
    expect(info).toMatchObject({ auth_ok: true });
    expect(info.detail).toBe(`the sign-in ends by ${soon}: run claude auth login before then`);
    expect(signInEnding('2026-12-01T00:00:00Z', now)).toBeUndefined();
    expect(signInEnding('not a date', now)).toBeUndefined();
    expect(signInEnding(undefined, now)).toBeUndefined();
  });
});

describe('forget', () => {
  const forget = (extra: Record<string, string> = {}) =>
    createClaudeForget({ executable: FAKE_CLAUDE, ...withEnv(extra) });
  const worktree = path.join(tmpdir(), 'repo', '.elvaria', 'worktrees', 'q_20261107_abc123');

  it('purges the transcripts of a removed worktree, and takes "nothing to purge" as done', async () => {
    await expect(forget()(worktree)).resolves.toBeUndefined();
    await expect(forget({ FAKE_CLAUDE_PURGE: 'nothing' })(worktree)).resolves.toBeUndefined();
  });

  it('throws on any other failure, for release to report', async () => {
    await expect(forget({ FAKE_CLAUDE_PURGE: 'fail' })(worktree)).rejects.toThrow(
      `claude purge --yes ${worktree}: EBUSY`,
    );
    const missing = createClaudeForget({ env: { PATH: '' } });
    await expect(missing(worktree)).rejects.toThrow(NOT_FOUND);
  });
});

describe('where Claude Code is', () => {
  let home: string;
  beforeAll(async () => {
    home = await mkdtemp(path.join(tmpdir(), 'elvaria home '));
  });
  afterAll(() => rm(home, RM_TEMP));

  const binary = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const homeEnv = () => (process.platform === 'win32' ? { USERPROFILE: home } : { HOME: home });

  async function place(...parts: string[]): Promise<string> {
    const file = path.join(home, ...parts);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, '');
    await chmod(file, 0o755);
    return file;
  }

  it('takes the newest VS Code extension when nothing else has it', async () => {
    const extensions = ['.vscode', 'extensions'];
    await place(
      ...extensions,
      'anthropic.claude-code-2.1.99-win32-x64',
      'resources',
      'native-binary',
      binary,
    );
    const newest = await place(
      ...extensions,
      'anthropic.claude-code-2.1.318-win32-x64',
      'resources',
      'native-binary',
      binary,
    );
    await place(...extensions, 'someone.else-1.0.0', 'resources', 'native-binary', binary);
    expect(await locateClaude({ PATH: '', ...homeEnv() }, process.platform)).toBe(newest);
  });

  it('prefers PATH, then the native installer', async () => {
    const local = await place('.local', 'bin', binary);
    expect(await locateClaude({ PATH: '', ...homeEnv() }, process.platform)).toBe(local);
    const onPath = await place('bin dir', binary);
    const env = { PATH: path.dirname(onPath), ...homeEnv() };
    expect(await locateClaude(env, process.platform)).toBe(onPath);
  });

  it("looks in npm's folder and in shims on Windows", async () => {
    const candidates = await claudeCandidates(
      {
        Path: String.raw`C:\tools`,
        USERPROFILE: String.raw`C:\Users\u`,
        APPDATA: String.raw`C:\Users\u\AppData\Roaming`,
      },
      'win32',
    );
    expect(candidates.slice(0, 4)).toEqual([
      String.raw`C:\tools\claude.exe`,
      String.raw`C:\tools\claude.cmd`,
      String.raw`C:\Users\u\.local\bin\claude.exe`,
      String.raw`C:\Users\u\AppData\Roaming\npm\claude.cmd`,
    ]);
    expect(await claudeCandidates({}, 'darwin')).toEqual([]);
  });

  it('starts a binary as it is, and a script or an npm shim with Node', async () => {
    const node = process.execPath;
    expect(await launchOf('/opt/claude', node)).toEqual({ file: '/opt/claude', args: [] });
    expect(await launchOf(FAKE_CLAUDE, node)).toEqual({ file: node, args: [FAKE_CLAUDE] });
    const shim = path.join(home, 'claude.cmd');
    await writeFile(
      shim,
      '@ECHO off\r\n"%_prog%"  "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*\r\n',
    );
    expect(await launchOf(shim, node)).toEqual({
      file: node,
      args: [
        path.win32.join(path.win32.dirname(shim), String.raw`node_modules\@anthropic-ai\claude-code\cli.js`),
      ],
    });
    const other = path.join(home, 'other.cmd');
    await writeFile(other, '@ECHO off\r\nclaude.exe %*\r\n');
    await expect(launchOf(other, node)).rejects.toThrow(/does not run a Node script/);
  });
});
