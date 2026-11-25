// A tribe's config folder (PS-27): every process of a tribe that names one runs with CLAUDE_CONFIG_DIR set to it, and
// none of a tribe that names none, whatever its env brought; doctor says which folder and account the CLI runs on.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import { doctorNoteOf } from '@elvaria/runner-core';
import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { FAKE_CLAUDE, fakeRunner, minimalEnv, prepare } from './__fixtures__/harness.ts';
import { accountEnv, accountOf } from './account.ts';
import { createClaudeForget } from './runner.ts';

describe('accountEnv', () => {
  const env = { PATH: '/bin', CLAUDE_CONFIG_DIR: 'D:/other', claude_config_dir: 'D:/lower' };

  it("sets the tribe's folder over any the env holds, in any spelling", () => {
    expect(accountEnv(env, 'D:/second')).toEqual({ PATH: '/bin', CLAUDE_CONFIG_DIR: 'D:/second' });
  });

  it('removes the variable for a tribe that names no folder', () => {
    expect(accountEnv(env, undefined)).toEqual({ PATH: '/bin' });
  });
});

describe('accountOf', () => {
  const signedIn = { configDirectory: 'C:/Users/owner/.claude', email: 'owner@example.com', orgId: 'org-1' };

  it('fingerprints the account without its address, and names the folder', () => {
    const { info, ignored } = accountOf(signedIn, undefined, 'win32');
    expect(info.config_dir).toBe('C:/Users/owner/.claude');
    expect(info.account).toMatch(/^[0-9a-f]{64}$/);
    expect(info.account).not.toContain('@');
    expect(ignored).toBeUndefined();
    const other = accountOf({ ...signedIn, orgId: 'org-2' }, undefined, 'win32').info.account;
    expect(other).not.toBe(info.account);
    expect(accountOf({ ...signedIn, orgId: undefined }, undefined, 'win32').info.account).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it('has no fingerprint before sign-in, and nothing from an older CLI', () => {
    expect(accountOf({ configDirectory: 'C:/x' }, undefined, 'win32').info).toEqual({ config_dir: 'C:/x' });
    expect(accountOf(undefined, 'C:/x', 'win32')).toEqual({ info: {} });
  });

  it('says the CLI did not hear the variable when it runs in another folder', () => {
    expect(accountOf(signedIn, 'C:/Users/owner/.elvaria/accounts/claude_2', 'win32').ignored).toEqual(
      doctorNoteOf('doctor:config_dir_ignored', {
        given: 'C:/Users/owner/.elvaria/accounts/claude_2',
        used: 'C:/Users/owner/.claude',
      }),
    );
  });

  it('takes one folder written two ways as one, without case only where the file system has none', () => {
    const at = (used: string) => ({ ...signedIn, configDirectory: used });
    expect(
      accountOf(at(String.raw`C:\Users\Owner\Second\\`), 'c:/users/owner/second', 'win32').ignored,
    ).toBeUndefined();
    expect(accountOf(at('/Users/Owner/Second/'), '/users/owner/second', 'darwin').ignored).toBeUndefined();
    expect(accountOf(at('/home/Owner/second'), '/home/owner/second', 'linux').ignored).toBeDefined();
  });
});

describe("the CLI in the tribe's folder (fake CLI)", () => {
  let temp: TempDir;
  let root: string;
  let second: string;
  beforeAll(async () => {
    temp = await tempDir('config dir');
    root = temp.root;
    second = path.join(root, 'accounts', 'claude_2');
    await mkdir(second, { recursive: true });
  });
  afterAll(() => temp.remove());

  /** The calls the fake CLI made in `dir`, one line each (fake-calls.jsonl). */
  const callsIn = async (dir: string): Promise<string[]> => {
    const file = path.join(dir, 'fake-calls.jsonl');
    if (!existsSync(file)) return [];
    const lines = (await readFile(file, 'utf8')).trim().split('\n');
    return lines.map((line) => (JSON.parse(line) as { call: string }).call);
  };

  it('runs /usage, the ping, auth status and purge there', async () => {
    const runner = fakeRunner({ configDir: second });
    expect((await runner.probe()).status).toBe('ok');
    expect(await runner.doctor()).toMatchObject({ auth_ok: true, config_dir: second });
    const forget = createClaudeForget({ executable: FAKE_CLAUDE, env: minimalEnv(), configDir: second });
    await forget(path.join(root, 'repo', '.elvaria', 'worktrees', 'q_20261118_abc123'));
    // doctor asks --version and auth status at once: their order is the machine's.
    expect((await callsIn(second)).sort()).toEqual(['auth', 'ping', 'purge', 'usage', 'version']);
  });

  it('runs a session there, the variable set last', async () => {
    const prepared = await prepare('submit', { configDir: second });
    const record = path.join(prepared.workspace.root, 'record.json');
    const elsewhere = path.join(root, 'elsewhere');
    const env = { ...prepared.request.env, FAKE_CLAUDE_RECORD: record, CLAUDE_CONFIG_DIR: elsewhere };
    const result = await (await prepared.runner.spawn({ ...prepared.request, env })).wait();
    expect(result.outcome).toBe('completed');
    const seen = JSON.parse(await readFile(record, 'utf8')) as { env: Record<string, string> };
    expect(seen.env.CLAUDE_CONFIG_DIR).toBe(second);
    expect(await callsIn(elsewhere)).toEqual([]);
    await prepared.workspace.remove();
  });

  it('runs a session of a tribe that names no folder without the variable, whatever its env brought', async () => {
    const prepared = await prepare('submit');
    const record = path.join(prepared.workspace.root, 'record.json');
    const smuggled = path.join(root, 'smuggled');
    const env = { ...prepared.request.env, FAKE_CLAUDE_RECORD: record, CLAUDE_CONFIG_DIR: smuggled };
    const result = await (await prepared.runner.spawn({ ...prepared.request, env })).wait();
    expect(result.outcome).toBe('completed');
    const seen = JSON.parse(await readFile(record, 'utf8')) as { env: Record<string, string> };
    expect(Object.keys(seen.env).filter((name) => name.toUpperCase() === 'CLAUDE_CONFIG_DIR')).toEqual([]);
    expect(await callsIn(smuggled)).toEqual([]);
    await prepared.workspace.remove();
  });

  it("reads each tribe's own gauge: two folders, two accounts, two readings", async () => {
    const third = path.join(root, 'accounts', 'claude_3');
    await mkdir(third, { recursive: true });
    const usage = (text: string) =>
      [
        JSON.stringify({ type: 'system', subtype: 'init', session_id: 'u' }),
        JSON.stringify({ type: 'result', subtype: 'success', is_error: false, num_turns: 0, result: text }),
      ].join('\n');
    await writeFile(path.join(second, 'fake-usage.jsonl'), usage('Current session: 12% used'));
    await writeFile(path.join(third, 'fake-usage.jsonl'), usage('Current session: 3% used'));
    const sessionOf = async (dir: string) =>
      (await fakeRunner({ configDir: dir }).probe({ ping: false })).windows?.map(({ used_pct }) => used_pct);
    expect(await sessionOf(second)).toEqual([12]);
    expect(await sessionOf(third)).toEqual([3]);
  });

  it('fails doctor when the CLI runs in its default folder all the same', async () => {
    const env = { ...minimalEnv(), FAKE_CLAUDE_IGNORES_CONFIG_DIR: '1' };
    const info = await fakeRunner({ configDir: second, env }).doctor();
    expect(info.auth_ok).toBe(false);
    expect(info.notes).toEqual([
      doctorNoteOf('doctor:config_dir_ignored', { given: second, used: path.join(homedir(), '.claude') }),
    ]);
  });

  it('tells one account in two folders from two accounts, never by its address', async () => {
    // The fake CLI's account is its folder's name: two folders named claude_2 are one account.
    const twin = path.join(root, 'twin', 'claude_2');
    const third = path.join(root, 'accounts', 'claude_3');
    await Promise.all([mkdir(twin, { recursive: true }), mkdir(third, { recursive: true })]);
    const accountIn = async (dir: string) => (await fakeRunner({ configDir: dir }).doctor()).account;
    const [first, same, other] = await Promise.all([accountIn(second), accountIn(twin), accountIn(third)]);
    expect(first).toBeDefined();
    expect(same).toBe(first);
    expect(other).not.toBe(first);
    expect(first).not.toContain('@');
  });
});
