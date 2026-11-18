// A tribe's home (PS-27c): every process of a tribe that names one runs with CODEX_HOME set to it, and none of a tribe
// that names none, whatever its env brought; doctor says which home and account Codex runs on, from the app-server.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { doctorNoteOf } from '@elvaria/runner-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { fakeRunner, minimalEnv, openWorld, request } from './__fixtures__/codex.ts';
import { accountOf, homeEnv } from './account.ts';
import type { World } from './__fixtures__/codex.ts';

describe('homeEnv', () => {
  const env = { PATH: '/bin', CODEX_HOME: 'D:/other', codex_home: 'D:/lower' };

  it("sets the tribe's home over any the env holds, in any spelling", () => {
    expect(homeEnv(env, 'D:/second')).toEqual({ PATH: '/bin', CODEX_HOME: 'D:/second' });
  });

  it('removes the variable for a tribe that names no home', () => {
    expect(homeEnv(env, undefined)).toEqual({ PATH: '/bin' });
  });
});

describe('accountOf', () => {
  const home = { userAgent: 'codex', codexHome: 'C:/Users/owner/.codex' };
  const limits = { rateLimits: {}, accountId: '0d4c1f5e-1111-4222-8333-944455556666' };

  it('fingerprints the account without its id, and names the home', () => {
    const { info, ignored } = accountOf(home, limits, undefined, 'win32');
    expect(info.config_dir).toBe('C:/Users/owner/.codex');
    expect(info.account).toMatch(/^[0-9a-f]{64}$/);
    expect(info.account).not.toContain(limits.accountId);
    expect(ignored).toBeUndefined();
    expect(accountOf(home, { accountId: 'another' }, undefined, 'win32').info.account).not.toBe(info.account);
  });

  it('has no fingerprint before sign-in, and nothing from a Codex that names neither', () => {
    expect(accountOf(home, undefined, undefined, 'win32').info).toEqual({ config_dir: home.codexHome });
    expect(accountOf({}, { accountId: '' }, 'C:/x', 'win32')).toEqual({ info: {} });
    expect(accountOf(undefined, null, 'C:/x', 'win32')).toEqual({ info: {} });
  });

  it('says Codex did not hear the variable when it runs in another home', () => {
    expect(accountOf(home, limits, 'C:/Users/owner/.elvaria/accounts/codex_2', 'win32').ignored).toEqual(
      doctorNoteOf('doctor:config_dir_ignored', {
        given: 'C:/Users/owner/.elvaria/accounts/codex_2',
        used: 'C:/Users/owner/.codex',
      }),
    );
  });

  it('takes one folder written two ways as one, without case only where the file system has none', () => {
    const at = (used: string) => ({ codexHome: used });
    expect(
      accountOf(at(String.raw`C:\Users\Owner\Second\\`), {}, 'c:/users/owner/second', 'win32').ignored,
    ).toBe(undefined);
    expect(
      accountOf(at('/Users/Owner/Second/'), {}, '/users/owner/second', 'darwin').ignored,
    ).toBeUndefined();
    expect(accountOf(at('/home/Owner/second'), {}, '/home/owner/second', 'linux').ignored).toBeDefined();
  });
});

describe("Codex in the tribe's home (fake CLI)", () => {
  let world: World;
  let second: string;
  beforeEach(async () => {
    world = await openWorld();
    second = await signedInHome(path.join(world.root, 'accounts', 'codex_2'));
  });
  afterEach(() => world.remove());

  /** A home `codex login` signed in: the fake CLI takes its auth.json for that. */
  async function signedInHome(dir: string): Promise<string> {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'auth.json'), '{}');
    return dir;
  }

  /** The calls the fake CLI made in `dir`, one line each (fake-calls.jsonl), in the order they ended. */
  const callsIn = async (dir: string): Promise<string[]> => {
    const file = path.join(dir, 'fake-calls.jsonl');
    if (!existsSync(file)) return [];
    const lines = (await readFile(file, 'utf8')).trim().split('\n');
    return lines.map((line) => (JSON.parse(line) as { call: string }).call);
  };

  /** A resumed session of a runner in `configDir`, its env carrying CODEX_HOME=`smuggled`: the home the session saw. */
  async function sessionHome(configDir: string | undefined, smuggled: string): Promise<string | undefined> {
    const log = path.join(world.root, 'calls.jsonl');
    const env = { ELVARIA_FAKE_CODEX_LOG: log, CODEX_HOME: smuggled };
    const req = request(world, env, { resume: { session_id: 'thread-7' } });
    const result = await (await fakeRunner({ configDir }).spawn(req)).wait();
    expect(result.outcome).toBe('completed');
    const lines = (await readFile(log, 'utf8')).trim().split('\n');
    const session = lines.map((line) => JSON.parse(line) as { argv: string[]; codex_home?: string });
    return session.find((call) => call.argv[0] === 'exec')?.codex_home;
  }

  it('checks the hooks and runs a session there, the variable set last', async () => {
    const elsewhere = path.join(world.root, 'elsewhere');
    expect(await sessionHome(second, elsewhere)).toBe(second);
    expect(await callsIn(second)).toEqual(['initialize', 'hooks/list', 'resume']);
    expect(await callsIn(elsewhere)).toEqual([]);
  });

  it('runs a session of a tribe that names no home without the variable, whatever its env brought', async () => {
    const smuggled = path.join(world.root, 'smuggled');
    expect(await sessionHome(undefined, smuggled)).toBeUndefined();
    expect(await callsIn(smuggled)).toEqual([]);
  });

  it('reads the windows and asks doctor there: the home, and an account', async () => {
    const runner = fakeRunner({ configDir: second });
    expect((await runner.probe()).status).toBe('ok');
    const info = await runner.doctor();
    expect(info).toMatchObject({
      auth_ok: true,
      config_dir: second,
      account: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown,
    });
    expect(info.notes).toBeUndefined();
    // doctor asks --version, login status and the app-server at once: their order is the machine's.
    const calls = [
      'account/rateLimits/read',
      'account/rateLimits/read',
      'initialize',
      'initialize',
      'login',
      'version',
    ];
    expect((await callsIn(second)).sort()).toEqual(calls);
  });

  it("reads each tribe's own gauge: two homes, two accounts, two readings", async () => {
    const third = await signedInHome(path.join(world.root, 'accounts', 'codex_3'));
    const used = async (dir: string, pct: number) => {
      const primary = { usedPercent: pct, windowDurationMins: 300, resetsAt: 1794502073 };
      const own = { ordinaryUsageAllowed: true, rateLimits: { limitId: 'codex', primary } };
      await writeFile(path.join(dir, 'fake-rate-limits.json'), JSON.stringify(own));
    };
    await Promise.all([used(second, 12), used(third, 3)]);
    const fiveHours = async (dir: string) =>
      (await fakeRunner({ configDir: dir }).probe()).windows?.find(({ window }) => window === 'five_hour')
        ?.used_pct;
    expect(await Promise.all([fiveHours(second), fiveHours(third)])).toEqual([12, 3]);
  });

  it('names the home but no account while the home is not signed in', async () => {
    const fresh = path.join(world.root, 'accounts', 'codex_4');
    await mkdir(fresh, { recursive: true });
    const info = await fakeRunner({ configDir: fresh }).doctor();
    expect(info).toMatchObject({ auth_ok: false, config_dir: fresh });
    expect(info.account).toBeUndefined();
    expect(info.notes).toEqual([
      doctorNoteOf('doctor:not_signed_in', { command: 'codex login status', login: 'codex login' }),
    ]);
  });

  it('fails doctor when Codex runs in its default home all the same', async () => {
    const env = { ...minimalEnv(), ELVARIA_FAKE_CODEX_IGNORES_HOME: '1' };
    const info = await fakeRunner({ configDir: second, env }).doctor();
    expect(info.auth_ok).toBe(false);
    expect(info.notes).toEqual([
      doctorNoteOf('doctor:config_dir_ignored', { given: second, used: path.join(homedir(), '.codex') }),
    ]);
  });

  it('notes an app-server that gave no answer, and vouches for a named home only once it did', async () => {
    const env = { ...minimalEnv(), ELVARIA_FAKE_CODEX_SERVER_HANGS: '1' };
    // 3 s, not 1: `login status` must end within it for the tribe that names no home to be vouched for.
    const timeout = 3000;
    const timedOut = doctorNoteOf('doctor:command_timed_out', { command: 'codex app-server', seconds: 3 });
    // `codex --version` runs alongside with the same time, and on a busy machine it runs out too (fix/timing-flakes).
    const version = doctorNoteOf('doctor:command_timed_out', { command: 'codex --version', seconds: 3 });
    const notesOf = (notes: readonly unknown[] | undefined) =>
      notes?.filter((note) => !isDeepStrictEqual(note, version));
    const [named, unnamed] = await Promise.all([
      fakeRunner({ configDir: second, env, timeout_ms: timeout }).doctor(),
      fakeRunner({ env, timeout_ms: timeout }).doctor(),
    ]);
    expect(named.auth_ok).toBe(false);
    expect(notesOf(named.notes)).toEqual([timedOut]);
    expect(unnamed.auth_ok).toBe(true);
    expect(notesOf(unnamed.notes)).toEqual([timedOut]);
    expect([unnamed.config_dir, unnamed.account]).toEqual([undefined, undefined]);
  });

  it('tells one account in two homes from two accounts, never by its id', async () => {
    // The fake CLI's account is its home's name: two homes named codex_2 are one account.
    const twin = await signedInHome(path.join(world.root, 'twin', 'codex_2'));
    const third = await signedInHome(path.join(world.root, 'accounts', 'codex_3'));
    const accountIn = async (dir: string) => (await fakeRunner({ configDir: dir }).doctor()).account;
    const [first, same, other] = await Promise.all([accountIn(second), accountIn(twin), accountIn(third)]);
    expect(first).toBeDefined();
    expect(same).toBe(first);
    expect(other).not.toBe(first);
    expect(first).not.toContain('codex_2');
  });
});
