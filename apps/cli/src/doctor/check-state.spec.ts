// `elvaria doctor` on the treasury file and on the sessions a stopped Steward left running (P1-11).
import { spawn } from 'node:child_process';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { POWERSHELL_TIMEOUT_MS } from '@elvaria/runner-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, gitRepo, printed, run, tempDir, testIo } from '../../test/cli.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

let dir: TempDir;
let kingdom: string;
let treasury: string;
const children: number[] = [];

beforeEach(async () => {
  dir = await tempDir();
  treasury = path.join(dir.root, 'owner home', 'treasury.json');
  kingdom = await foundKingdom(dir.root, testIo(), '--treasury', treasury);
});
afterEach(async () => {
  for (const pid of children.splice(0)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Ended already.
    }
  }
  await dir.remove();
});

const shown = (file: string) => file.replaceAll('\\', '/');

async function doctor(io: TestIo = testIo()): Promise<string> {
  await run(io, 'doctor', '--kingdom', kingdom, '--locale', 'en');
  return printed(io);
}

/** A territory whose quests may ask for these treasury names. */
async function allowing(...names: string[]): Promise<void> {
  const repo = await gitRepo(path.join(dir.root, 'repo'));
  await run(testIo(), 'territory', 'add', repo, '--kingdom', kingdom);
  const file = path.join(kingdom, 'territories', 'repo', 'territory.json');
  const territory = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  await writeFile(file, JSON.stringify({ ...territory, secrets_allowed: names }));
}

async function save(text: string): Promise<void> {
  await mkdir(path.dirname(treasury), { recursive: true });
  await writeFile(treasury, text, 'utf8');
  await chmod(treasury, 0o600);
}

describe('elvaria doctor: the treasury (ADR 0013)', () => {
  it('passes without a file while no territory allows a secret', async () => {
    expect(await doctor()).toContain(
      `✓ Treasury ${shown(treasury)}: no file yet; no territory allows a secret.`,
    );
  });

  it('names what the territories allow and the file lacks, never a value', async () => {
    await allowing('npm_token', 'sentry_dsn');
    expect(await doctor()).toContain('    npm_token (repo)');
    await save(JSON.stringify({ npm_token: 'npm-v4lue' }));
    const lacking = await doctor();
    expect(lacking).toContain(`! Treasury ${shown(treasury)} lacks names the territories allow`);
    expect(lacking).toContain('    sentry_dsn (repo)');
    expect(lacking).not.toContain('npm_token (repo)');
    expect(lacking).not.toContain('v4lue');
    await save(JSON.stringify({ npm_token: 'npm-v4lue', sentry_dsn: 'https://k3y@sentry' }));
    const full = await doctor();
    expect(full).toContain(`✓ Treasury ${shown(treasury)}: 2 names, every name the territories allow.`);
    expect(full).not.toMatch(/v4lue|k3y/);
  });

  it.each([
    ['not JSON', '{"npm_token": "npm-v4lue"', 'is not valid JSON.'],
    ['not an object', '["npm-v4lue"]', 'is not a JSON object of the form { "name": "value" }.'],
    ['a bad name', '{"NPM-TOKEN": "npm-v4lue"}', '"NPM-TOKEN" is not a secret name'],
    ['a bad value', '{"npm_token": 42}', 'the value of npm_token is not a non-empty string.'],
  ])('fails on a file that is %s, without quoting it', async (_case, text, said) => {
    await save(text);
    const io = testIo();
    const report = await doctor(io);
    expect(report).toContain(`✗ Treasury ${shown(treasury)}`);
    expect(report).toContain(said);
    expect(report).not.toContain('v4lue');
  });

  it('fails on macOS when other users can read the file', async () => {
    await save('{"npm_token": "npm-v4lue"}');
    await chmod(treasury, 0o644);
    // Windows has no group or other bits to speak of; the macOS check runs with its platform anywhere.
    expect(await doctor(testIo({ platform: 'darwin' }))).toMatch(
      /✗ Treasury .*: other users can read it \(mode 6\d\d\);.*chmod 600/,
    );
  });

  it('fails when the path cannot be read as a file', async () => {
    await mkdir(treasury, { recursive: true });
    expect(await doctor()).toMatch(/✗ Treasury .*: cannot be read \(E[A-Z]+\)\./);
  });
});

describe('elvaria doctor: sessions a stopped Steward left running (P1-06)', () => {
  it('says nothing without a record', async () => {
    expect(await doctor()).not.toContain('left behind');
  });

  // A cold PowerShell tells the start time of the process on a Windows CI runner.
  it(
    'names each session still running and says the next run kills it',
    { timeout: 2 * POWERSHELL_TIMEOUT_MS },
    async () => {
      const orphan = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      const pid = orphan.pid ?? 0;
      children.push(pid);
      const session = {
        quest: 'q_20261107_aaaaaa',
        role: 'assignee',
        character: 'thorn',
        pid,
        spawned_at: new Date().toISOString(),
      };
      await mkdir(path.join(kingdom, '.state'), { recursive: true });
      await writeFile(
        path.join(kingdom, '.state', 'sessions.json'),
        JSON.stringify({ version: 1, sessions: [session] }),
      );
      const report = await doctor();
      expect(report).toContain(
        '! 1 sessions a stopped Steward left behind are still running; the next elvaria run kills them:',
      );
      expect(report).toContain(
        `    q_20261107_aaaaaa: thorn (assignee), pid ${String(pid)}, opened at ${session.spawned_at}`,
      );
    },
  );
});
