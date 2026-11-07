import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { QUEST } from '../__fixtures__/world.ts';
import { MINIMAL_ENV_NAMES, minimalEnv } from './minimal-env.ts';
import { secretEnvNamesOf, secretValuesOf, sessionEnv } from './session-env.ts';
import { inspectTreasury, openFileTreasury, secretEnvName } from './treasury.ts';

/** A machine env as the composition root sees it: toolchain variables among the owner's own secrets. */
const MACHINE = {
  Path: 'C:\\Windows;C:\\nodejs',
  HOME: '/home/owner',
  USERPROFILE: 'C:\\Users\\owner',
  APPDATA: 'C:\\Users\\owner\\AppData\\Roaming',
  LOCALAPPDATA: 'C:\\Users\\owner\\AppData\\Local',
  TEMP: 'C:\\Temp',
  TMP: 'C:\\Temp',
  TMPDIR: '/var/folders/xy/T/',
  SystemRoot: 'C:\\Windows',
  ComSpec: 'C:\\Windows\\system32\\cmd.exe',
  PATHEXT: '.COM;.EXE;.CMD',
  LANG: 'vi_VN.UTF-8',
  ANTHROPIC_API_KEY: 'sk-ant-owner-key',
  GITHUB_TOKEN: 'ghp_owner',
  AWS_SECRET_ACCESS_KEY: 'aws-owner',
  NPM_TOKEN: 'npm-owner-from-the-shell',
  GIT_DIR: '/repo/.git',
  CLAUDE_CODE_MESSAGING_TOKEN: 'messaging',
  ELVARIA_QUEST: 'q_stale',
  UNSET: undefined,
};

const CONTEXT = { ELVARIA_KINGDOM: '/kingdom', ELVARIA_QUEST: QUEST.id, ELVARIA_ATTEMPT: '2' };

describe('minimalEnv', () => {
  it('passes the allowlist and nothing else, one PATH whatever its spelling (ADR 0013)', () => {
    expect(minimalEnv(MACHINE)).toEqual({
      PATH: 'C:\\Windows;C:\\nodejs',
      HOME: '/home/owner',
      USERPROFILE: 'C:\\Users\\owner',
      APPDATA: 'C:\\Users\\owner\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\Users\\owner\\AppData\\Local',
      TEMP: 'C:\\Temp',
      TMP: 'C:\\Temp',
      TMPDIR: '/var/folders/xy/T/',
      SystemRoot: 'C:\\Windows',
      ComSpec: 'C:\\Windows\\system32\\cmd.exe',
      PATHEXT: '.COM;.EXE;.CMD',
      LANG: 'vi_VN.UTF-8',
    });
    expect(minimalEnv({ PATH: '/bin', HOME: '/home/o' })).toEqual({ PATH: '/bin', HOME: '/home/o' });
    expect(MINIMAL_ENV_NAMES).not.toContain('GIT_DIR');
  });
});

describe('sessionEnv', () => {
  it('is the minimal env, the context and the quest secrets, nothing else (env snapshot)', () => {
    const env = sessionEnv({ base: minimalEnv(MACHINE), context: CONTEXT, secrets: { npm_token: 'npm-q' } });
    expect(Object.keys(env).sort()).toEqual(
      [...MINIMAL_ENV_NAMES, 'ELVARIA_KINGDOM', 'ELVARIA_QUEST', 'ELVARIA_ATTEMPT', 'NPM_TOKEN'].sort(),
    );
    // The treasury's value, not the shell's.
    expect(env.NPM_TOKEN).toBe('npm-q');
    expect(env.ELVARIA_QUEST).toBe(QUEST.id);
  });

  it('drops a git variable from the base', () => {
    expect(sessionEnv({ base: { PATH: '/bin', GIT_DIR: '/x' }, context: {}, secrets: {} })).toEqual({
      PATH: '/bin',
    });
  });

  it.each([
    ['a base variable', 'path'],
    ['a context variable', 'elvaria_attempt'],
    ['an Elvaria name', 'elvaria_secret'],
    ['a git variable', 'git_dir'],
  ])('refuses a secret that would replace %s, naming it but never its value', (_case, name) => {
    const run = () => sessionEnv({ base: { PATH: '/bin' }, context: CONTEXT, secrets: { [name]: 'v4lue' } });
    expect(run).toThrow(new RegExp(`secret ${name} would replace the variable ${name.toUpperCase()}`));
    expect(run).not.toThrow(/v4lue/);
  });
});

describe('secret names and values of a request', () => {
  const quest = { ...QUEST, secrets_required: ['npm_token', 'sentry_dsn'] };

  it('names the env variables of the quest secrets, none without a quest', () => {
    expect(secretEnvName('gemini_api_key')).toBe('GEMINI_API_KEY');
    expect(secretEnvNamesOf({ quest })).toEqual(['NPM_TOKEN', 'SENTRY_DSN']);
    expect(secretEnvNamesOf({})).toEqual([]);
  });

  it('reads their values from the request env, skipping what is unset or empty', () => {
    const env = { NPM_TOKEN: 'npm-q', SENTRY_DSN: '', PATH: '/bin' };
    expect(secretValuesOf({ quest, env })).toEqual(['npm-q']);
    expect(secretValuesOf({ quest: { ...quest, secrets_required: [] }, env })).toEqual([]);
  });
});

describe('openFileTreasury', () => {
  let dir: string;
  let file: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'elvaria treasury '));
    file = path.join(dir, 'treasury.json');
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  const save = async (text: string): Promise<void> => {
    await writeFile(file, text, 'utf8');
    await chmod(file, 0o600);
  };
  const windows = () => openFileTreasury(file, { platform: 'win32' });

  it('is empty when the file does not exist, and refuses a name it does not hold', async () => {
    const missing = openFileTreasury(path.join(dir, 'none.json'));
    expect(await missing.names()).toEqual([]);
    expect(await missing.resolve([])).toEqual({});
    await expect(missing.resolve(['npm_token'])).rejects.toThrow(/has no npm_token$/);
  });

  it('lists names, never values, and resolves exactly the names asked for', async () => {
    await save(JSON.stringify({ sentry_dsn: 'https://s@x', npm_token: 'npm-v4lue' }));
    expect(await windows().names()).toEqual(['npm_token', 'sentry_dsn']);
    expect(await windows().resolve(['npm_token'])).toEqual({ npm_token: 'npm-v4lue' });
    await expect(windows().resolve(['npm_token', 'aws_key', 'gh'])).rejects.toThrow(/has no aws_key, gh$/);
  });

  it.each([
    ['not JSON', '{"npm_token": "npm-v4lue"', /is not valid JSON$/],
    ['not an object', '["npm-v4lue"]', /is not a JSON object/],
    ['a name that is no secret name', '{"NPM-TOKEN": "npm-v4lue"}', /"NPM-TOKEN" is not a secret name/],
    ['a value that is no string', '{"npm_token": 42}', /the value of npm_token is not a non-empty string/],
    ['an empty value', '{"npm_token": ""}', /the value of npm_token is not a non-empty string/],
  ])('refuses a file that is %s, without quoting it', async (_case, text, message) => {
    await save(text);
    const read = windows().names();
    await expect(read).rejects.toThrow(message);
    await expect(windows().names()).rejects.not.toThrow(/v4lue/);
  });

  it('inspectTreasury: names or what is wrong, never a value (elvaria doctor)', async () => {
    const inspect = (target = file) => inspectTreasury(target, { platform: 'win32' });
    expect(await inspect(path.join(dir, 'none.json'))).toEqual({
      ok: true,
      value: { found: false, names: [] },
    });
    await save(JSON.stringify({ sentry_dsn: 'https://s@x', npm_token: 'npm-v4lue' }));
    expect(await inspect()).toEqual({ ok: true, value: { found: true, names: ['npm_token', 'sentry_dsn'] } });
    await save('{"npm_token": "npm-v4lue"');
    expect(await inspect()).toEqual({ ok: false, error: { kind: 'not_json' } });
    await save('null');
    expect(await inspect()).toEqual({ ok: false, error: { kind: 'not_object' } });
    await save('{"NPM-TOKEN": "npm-v4lue"}');
    expect(await inspect()).toEqual({ ok: false, error: { kind: 'bad_name', name: 'NPM-TOKEN' } });
    await save('{"npm_token": ""}');
    expect(await inspect()).toEqual({ ok: false, error: { kind: 'bad_value', name: 'npm_token' } });
    await chmod(file, 0o640);
    // Windows reports 666 whatever chmod asked; the macOS check runs with its platform anywhere.
    expect(await inspectTreasury(file, { platform: 'darwin' })).toEqual({
      ok: false,
      error: { kind: 'shared', mode: expect.stringMatching(/^6[46]\d$/) as string },
    });
  });

  it('refuses, outside Windows, a file other users can read (mode 0600, ADR 0013)', async () => {
    await save('{"npm_token": "npm-v4lue"}');
    // Windows reports no Unix bits that matter; the check is the macOS one, run with its platform.
    const posix = openFileTreasury(file, { platform: 'darwin' });
    if (process.platform !== 'win32') expect(await posix.names()).toEqual(['npm_token']);
    await chmod(file, 0o644);
    await expect(openFileTreasury(file, { platform: 'darwin' }).names()).rejects.toThrow(
      /can be read by other users \(mode 6\d\d\); run: chmod 600/,
    );
    expect(await windows().names()).toEqual(['npm_token']);
  });
});
