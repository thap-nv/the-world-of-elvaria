// End to end: the built bin as the owner runs it (`node dist/cli.js`), on a throwaway kingdom, on every OS of the
// CI matrix (implementation-plan §8, P0-08). `pnpm --filter @elvaria/cli test` builds dist/ first.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { InboxCommandSchema } from '@elvaria/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SHA_A, calls, placeBuild, real, writePin } from '../test/builds.ts';
import { baseEnv, fakeTool, gitRepo, isolatedPath, tempDir } from '../test/cli.ts';
import { OTHER_QUEST_ID, QUEST_ID, plantQuests, questFixture } from '../test/quest.ts';
import type { Env } from './io.ts';
import type { TempDir } from '../test/cli.ts';

const CLI = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
/** The fake day of the sandbox specs: a fixed date keeps its file name the same on every run. */
const DAY = '2026-11-06';

interface Outcome {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function elvaria(env: Env, ...args: string[]): Promise<Outcome> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], { env, shell: false, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

describe('node dist/cli.js', () => {
  let dir: TempDir;
  let env: Env;
  let kingdom: string;
  let repo: string;
  beforeAll(async () => {
    if (!existsSync(CLI)) throw new Error(`${CLI} is missing: run pnpm --filter @elvaria/cli build`);
    dir = await tempDir();
    const bin = path.join(dir.root, 'bin');
    await fakeTool(bin, 'claude', '2.1.318 (Claude Code)');
    await fakeTool(bin, 'agy', '1.5.2');
    kingdom = path.join(dir.root, 'Kingdom of Agents', 'kingdom');
    repo = await gitRepo(path.join(dir.root, 'dc1-se-team'));
    // ELVARIA_KINGDOM is how hooks and later the Steward find the kingdom (§3.6); the CLI reads it too.
    env = { ...baseEnv(await isolatedPath(bin)), ELVARIA_KINGDOM: kingdom };
  });
  afterAll(() => dir.remove());

  it('founds a kingdom and makes it ready', async () => {
    const init = await elvaria(env, 'init', '--name', 'Bình Minh', '--tz', 'Asia/Ho_Chi_Minh');
    expect(init).toMatchObject({ code: 0, stderr: '' });
    expect(init.stdout).toContain('Đã lập vương quốc «Bình Minh»');
    const doctor = await elvaria(env, 'doctor', '--acknowledge-terms', 'gemini');
    expect(doctor.stdout).toContain('✓ Tộc claude: ');
    expect(doctor.stdout).toContain('phiên bản 2.1.318');
    expect(doctor.stdout.trim().split(/\r?\n/).at(-1)).toBe('Sẵn sàng.');
    expect(doctor.code).toBe(0);
  });

  it('attaches a territory and summons a character', async () => {
    const territory = await elvaria(env, 'territory', 'add', repo);
    expect(territory).toMatchObject({ code: 0, stderr: '' });
    expect(territory.stdout).toContain('git: nhánh mặc định main.');
    const character = await elvaria(env, 'character', 'add', 'thorn', '--class', 'knight', '--level', '5');
    expect(character).toMatchObject({ code: 0, stderr: '' });
    const list = await elvaria(env, 'character', 'list', '--locale', 'en');
    expect(list.stdout).toMatch(/thorn\s+Thorn\s+Knight\s+claude\s+claude-sonnet-5-5\s+5\s+Idle/);
  });

  it('sends quest commands to the inbox and never writes a quest itself (ADR 0005)', async () => {
    const add = await elvaria(
      env,
      'quest',
      'add',
      '--title',
      'Thêm pnpm check',
      '--description',
      'Gom lint và test',
      '--kind',
      'build',
      '--rank',
      'D',
      '--class',
      'knight',
      '--territory',
      'dc1-se-team',
      '--tag',
      'infra',
    );
    expect(add).toMatchObject({ code: 0, stderr: '' });
    const files = await readdir(path.join(kingdom, 'inbox'));
    const commands = files.filter((file) => file.endsWith('.json'));
    expect(commands).toHaveLength(1);
    const command = InboxCommandSchema.parse(
      JSON.parse(await readFile(path.join(kingdom, 'inbox', commands[0] ?? ''), 'utf8')),
    );
    expect(command).toMatchObject({
      kind: 'create_quest',
      source: 'cli',
      payload: { draft: false, territory: 'dc1-se-team' },
    });
    expect(await readdir(path.join(kingdom, 'quests'))).toEqual([]);

    // The Steward (P1-03) writes quests; here the test stands in for it.
    await plantQuests(
      kingdom,
      questFixture('draft', QUEST_ID, { territory: 'dc1-se-team' }),
      questFixture('open', OTHER_QUEST_ID),
    );
    const list = await elvaria(env, 'quest', 'list', '--locale', 'en');
    expect(list.code).toBe(0);
    expect(list.stdout).toContain(`${QUEST_ID}  Draft`);
    expect(list.stdout).toContain('1 commands wait for the Steward in the inbox.');
    expect((await elvaria(env, 'quest', 'show', QUEST_ID)).stdout).toContain('Thêm script pnpm check');
    expect((await elvaria(env, 'quest', 'confirm', QUEST_ID)).code).toBe(0);
    expect((await elvaria(env, 'quest', 'edit', OTHER_QUEST_ID, '--rank', 'C')).code).toBe(0);
    expect((await elvaria(env, 'quest', 'cancel', OTHER_QUEST_ID, '--reason', 'thử')).code).toBe(0);
    const kinds = await Promise.all(
      (await readdir(path.join(kingdom, 'inbox')))
        .filter((file) => file.endsWith('.json'))
        .map(
          async (file) =>
            InboxCommandSchema.parse(JSON.parse(await readFile(path.join(kingdom, 'inbox', file), 'utf8')))
              .kind,
        ),
    );
    expect(kinds.sort()).toEqual(['cancel', 'confirm', 'create_quest', 'edit_quest']);
  });

  it('generates a fake day and replays it as a timeline: the milestone of stage 0 (§8)', async () => {
    const generate = await elvaria(
      env,
      'sandbox',
      'generate',
      '--day',
      'busy',
      '--seed',
      '42',
      '--date',
      DAY,
    );
    expect(generate).toMatchObject({ code: 0, stderr: '' });
    const file = path.join(kingdom, 'events', 'sandbox', `${DAY}.jsonl`);
    expect(generate.stdout).toContain(file);
    // Fast enough for CI: the whole day plays in well under a second.
    const replay = await elvaria(env, 'sandbox', 'replay', file, '--speed', '1000000');
    expect(replay).toMatchObject({ code: 0, stderr: '' });
    const lines = replay.stdout.trimEnd().split(/\r?\n/);
    const count = (await readFile(file, 'utf8')).trimEnd().split('\n').length;
    expect(lines[0]).toMatch(/^── DỮ LIỆU GIẢ · ngày 2026-11-06 · \d+ dòng · 08:30–/);
    expect(lines[1]).toBe('08:30:00  Lãnh thổ «Web Portal» gia nhập vương quốc');
    expect(lines.at(-1)).toBe(`── hết ngày giả: ${count} dòng ──`);
    expect(lines).toHaveLength(count + 2);
  });

  it('stops quietly when the reader of a replay closes the pipe', async () => {
    const file = path.join(kingdom, 'events', 'sandbox', `${DAY}.jsonl`);
    const child = spawn(process.execPath, [CLI, 'sandbox', 'replay', file, '--speed', '2000'], {
      env,
      shell: false,
      windowsHide: true,
    });
    let stderr = '';
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk));
    // Like `| head`: read the first lines, then go away while the replay is still writing.
    child.stdout.once('data', () => child.stdout.destroy());
    const code = await new Promise<number | null>((resolve) => child.on('close', resolve));
    expect({ code, stderr }).toEqual({ code: 0, stderr: '' });
  });

  it('migrates, and exits 2 on a wrong command line', async () => {
    expect(await elvaria(env, 'migrate', '--locale', 'en')).toMatchObject({
      code: 0,
      stdout: 'Every file is at the current version; nothing to migrate.\n',
    });
    const wrong = await elvaria(env, 'quest', 'add', '--locale', 'en');
    expect(wrong.code).toBe(2);
    expect(wrong.stderr).toContain('Missing required option --title.');
  });

  // Last: from here on the kingdom pins a stub build (PS-04b).
  it('runs every command on the build its kingdom pins, except with --here', async () => {
    const build = await placeBuild(kingdom, SHA_A, { exit: { 'quest list': 3 } });
    await writePin(kingdom, SHA_A);
    const record = path.join(dir.root, 'pinned calls.jsonl');
    const pinnedEnv = { ...env, ELVARIA_TEST_RECORD: record };
    expect(await elvaria(pinnedEnv, 'quest', 'list')).toMatchObject({
      code: 3,
      stdout: 'stub: quest list fails\n',
    });
    expect(await calls(record)).toEqual([
      expect.objectContaining({ root: real(build), argv: ['quest', 'list'], pinned: SHA_A }),
    ]);
    const here = await elvaria(pinnedEnv, 'quest', 'list', '--here', '--locale', 'en');
    expect(here.code).toBe(0);
    expect(await calls(record)).toHaveLength(1);
  });
});
