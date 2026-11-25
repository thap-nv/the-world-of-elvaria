// `elvaria territory delivery` (PS-08, ADR 0023): prints how a territory delivers, writes territory.json as
// `territory add` does (ADR 0005 exception), refuses a pushing mode without a remote on a forge, and writes no event.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, git, gitRepo, printed, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import { GITHUB_REMOTE } from '../__fixtures__/credential.ts';
import type { TempDir } from '../__fixtures__/cli.ts';

describe('elvaria territory delivery', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  /** A territory attached by the CLI from a repo whose origin is `remote` (none: no origin). */
  async function attach(id: string, remote?: string): Promise<void> {
    const repo = await gitRepo(path.join(dir.root, `repo ${id}`));
    if (remote !== undefined) git(repo, 'remote', 'add', 'origin', remote);
    const io = testIo();
    if ((await run(io, 'territory', 'add', repo, '--id', id, '--kingdom', kingdom)) !== 0)
      throw new Error(printed(io));
  }

  const fileOf = (id: string) => path.join(kingdom, 'territories', id, 'territory.json');
  const read = async (id: string) =>
    JSON.parse(await readFile(fileOf(id), 'utf8')) as Record<string, unknown>;

  const delivery = async (...args: string[]) => {
    const io = testIo();
    const code = await run(io, 'territory', 'delivery', ...args, '--kingdom', kingdom, '--locale', 'en');
    return { code, text: printed(io), io };
  };

  /** The event log, all days: a delivery change writes no line. */
  const eventLines = async () => {
    const days = await readdir(path.join(kingdom, 'events'));
    const texts = await Promise.all(days.map((day) => readFile(path.join(kingdom, 'events', day), 'utf8')));
    return texts.join('');
  };

  it('prints manual, and says the file has no delivery, for a territory attached before', async () => {
    await attach('elvaria', GITHUB_REMOTE);
    const { code, text } = await delivery('elvaria');
    expect(code).toBe(0);
    expect(text).toContain('Territory elvaria delivers by: manual');
    expect(text).toContain('territory.json names no delivery');
    expect(text).toContain('forge: github (elvaria-specs/kingdom-repo)');
    expect(text).toContain('merge method: merge');
    expect(text).toContain('required checks: none');
    expect(text).toContain('wait for checks: 60 min');
    expect(await read('elvaria')).not.toHaveProperty('delivery');
  });

  it('writes the mode with every default, says when it counts, and writes no event', async () => {
    await attach('elvaria', GITHUB_REMOTE);
    const before = await eventLines();
    const { code, text } = await delivery('elvaria', '--mode', 'pr');
    expect(code).toBe(0);
    expect(text).toContain('Territory elvaria delivers by: pr');
    expect(text).toContain('the Steward reads it at its next tick');
    expect(text).toContain('elvaria doctor');
    expect(text).not.toContain('names no delivery');
    expect((await read('elvaria')).delivery).toEqual({
      mode: 'pr',
      forge: 'github',
      merge_method: 'merge',
      required_checks: [],
      checks_timeout_minutes: 60,
    });
    expect(await eventLines()).toBe(before);
  });

  it('changes only what is typed, keeps the rest of the file, and replaces the list of checks', async () => {
    await attach('elvaria', GITHUB_REMOTE);
    const file = fileOf('elvaria');
    await writeFile(file, JSON.stringify({ ...(await read('elvaria')), max_concurrent: 3 }));
    await delivery('elvaria', '--mode', 'pr_merge', '--required-check', 'ci', '--required-check', 'lint');
    const { code, text } = await delivery(
      'elvaria',
      '--merge-method',
      'squash',
      '--timeout',
      '90',
      '--required-check',
      'ci / check',
      '--required-check',
      'ci / check',
    );
    expect(code).toBe(0);
    expect(text).toContain('required checks: ci / check');
    const written = await read('elvaria');
    expect(written.max_concurrent).toBe(3);
    expect(written.delivery).toEqual({
      mode: 'pr_merge',
      forge: 'github',
      merge_method: 'squash',
      required_checks: ['ci / check'],
      checks_timeout_minutes: 90,
    });
  });

  it('goes back to manual on a territory without a remote', async () => {
    await attach('local');
    const { code, text } = await delivery('local', '--mode', 'manual');
    expect(code).toBe(0);
    expect(text).toContain('forge: github (the remote names no repo there)');
    expect((await read('local')).delivery).toMatchObject({ mode: 'manual' });
  });

  it.each([
    ['local', undefined, 'Territory local has no git remote (origin), which pr pushes to: nothing changed.'],
    [
      'lab',
      'https://gitlab.com/team/repo.git',
      'The remote of territory lab, https://gitlab.com/team/repo.git, names no repo on github: nothing changed.',
    ],
  ])('refuses pr on %s and leaves the file as it was', async (id, remote, sentence) => {
    await attach(id, remote);
    const before = await readFile(fileOf(id), 'utf8');
    const { code, text } = await delivery(id, '--mode', 'pr');
    expect(code).toBe(1);
    expect(text).toContain(sentence);
    expect(await readFile(fileOf(id), 'utf8')).toBe(before);
  });

  it('refuses pr on a folder without git', async () => {
    const folder = path.join(dir.root, 'notes ạ');
    await mkdir(folder);
    await run(testIo(), 'territory', 'add', folder, '--id', 'notes', '--kingdom', kingdom);
    const { code, text } = await delivery('notes', '--mode', 'pr_merge');
    expect(code).toBe(1);
    expect(text).toContain('Territory notes has no git remote (origin), which pr_merge pushes to');
  });

  it.each([
    [['--mode', 'auto'], '--mode takes one of: manual, pr, pr_merge.'],
    [['--merge-method', 'rebase'], '--merge-method takes one of: merge, squash.'],
    [['--timeout', '0'], '--timeout takes whole minutes from 1, not 0.'],
    [['--timeout', '1.5'], '--timeout takes whole minutes from 1, not 1.5.'],
  ])('refuses %j as a usage error', async (args, sentence) => {
    await attach('elvaria', GITHUB_REMOTE);
    const { code, text } = await delivery('elvaria', ...args);
    expect(code).toBe(2);
    expect(text).toContain(sentence);
    expect(await read('elvaria')).not.toHaveProperty('delivery');
  });

  it.each(['nowhere', 'Not An Id'])('says there is no territory %j', async (id) => {
    const { code, text } = await delivery(id, '--mode', 'pr');
    expect(code).toBe(1);
    expect(text).toContain(`There is no territory ${id}`);
  });
});
