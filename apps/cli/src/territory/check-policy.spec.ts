// `elvaria territory checks` (CM-01, ADR 0032): prints a territory's check mode and each check's commands, writes the
// mode into territory.json as `territory delivery` does (ADR 0005 exception), refuses `deferred` without a train to
// deliver by, and writes no event.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, git, gitRepo, printed, run, tempDir, testIo } from '../__fixtures__/cli.ts';
import { GITHUB_REMOTE } from '../__fixtures__/credential.ts';
import type { TempDir } from '../__fixtures__/cli.ts';

const CHECKS = [
  {
    id: 'test',
    run: 'pnpm test',
    narrow: 'pnpm check:changed --only test',
    when: ['packages/**'],
    timeout_minutes: 30,
  },
  { id: 'layout', run: ['pnpm layout', 'pnpm dup'], when: ['packages/**'], timeout_minutes: 5 },
];

describe('elvaria territory checks', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    const repo = await gitRepo(path.join(dir.root, 'repo elvaria'));
    git(repo, 'remote', 'add', 'origin', GITHUB_REMOTE);
    const io = testIo();
    if ((await run(io, 'territory', 'add', repo, '--id', 'elvaria', '--kingdom', kingdom)) !== 0)
      throw new Error(printed(io));
  });
  afterEach(() => dir.remove());

  const fileOf = (id: string) => path.join(kingdom, 'territories', id, 'territory.json');
  const read = async () => JSON.parse(await readFile(fileOf('elvaria'), 'utf8')) as Record<string, unknown>;
  const withChecks = async () =>
    writeFile(fileOf('elvaria'), JSON.stringify({ ...(await read()), checks: CHECKS }));

  const checks = async (...args: string[]) => {
    const io = testIo();
    const code = await run(io, 'territory', 'checks', ...args, '--kingdom', kingdom, '--locale', 'en');
    return { code, text: printed(io) };
  };

  const eventLines = async () => {
    const days = await readdir(path.join(kingdom, 'events'));
    const texts = await Promise.all(days.map((day) => readFile(path.join(kingdom, 'events', day), 'utf8')));
    return texts.join('');
  };

  it('prints full for a territory that names no policy, and each check with its narrow command', async () => {
    await withChecks();
    const { code, text } = await checks('elvaria');
    expect(code).toBe(0);
    expect(text).toContain('Territory elvaria checks in mode: full');
    expect(text).toContain('names no check_policy');
    expect(text).toContain('full run when a quest touches: none');
    expect(text).toContain('test: pnpm test; narrow: pnpm check:changed --only test');
    expect(text).toContain('layout: pnpm layout && pnpm dup');
    expect(await read()).not.toHaveProperty('check_policy');
  });

  it('writes the mode, keeps what the policy had, and writes no event', async () => {
    await writeFile(
      fileOf('elvaria'),
      JSON.stringify({ ...(await read()), checks: CHECKS, check_policy: { full_when: ['package.json'] } }),
    );
    const before = await eventLines();
    const { code, text } = await checks('elvaria', '--mode', 'narrow');
    expect(code).toBe(0);
    expect(text).toContain('Territory elvaria checks in mode: narrow');
    expect(text).toContain('full run when a quest touches: package.json');
    expect(text).toContain('the Steward reads it at its next tick');
    expect(text).not.toContain('No check declares narrow');
    expect((await read()).check_policy).toEqual({ mode: 'narrow', full_when: ['package.json'] });
    expect(await eventLines()).toBe(before);
  });

  it('writes every default into a file without a policy, and says no check declares a narrow command', async () => {
    const { code, text } = await checks('elvaria', '--mode', 'narrow');
    expect(code).toBe(0);
    expect(text).toContain('No check declares narrow');
    expect((await read()).check_policy).toEqual({
      mode: 'narrow',
      full_when: [],
      train: { max_quests: 5, max_wait_minutes: 30 },
    });
  });

  it('refuses deferred until the territory delivers by pr_merge with merge commits', async () => {
    const refused = await checks('elvaria', '--mode', 'deferred');
    expect(refused.code).toBe(1);
    expect(refused.text).toContain('Mode deferred needs territory elvaria to deliver by pr_merge');
    expect(await read()).not.toHaveProperty('check_policy');
    const io = testIo();
    expect(
      await run(io, 'territory', 'delivery', 'elvaria', '--mode', 'pr_merge', '--kingdom', kingdom),
    ).toBe(0);
    const { code, text } = await checks('elvaria', '--mode', 'deferred');
    expect(code).toBe(0);
    expect(text).toContain('train: departs at 5 quests or after 30 min');
  });

  it('refuses an unknown mode and an unknown territory', async () => {
    const lazy = await checks('elvaria', '--mode', 'lazy');
    expect(lazy.code).toBe(2);
    expect(lazy.text).toContain('--mode takes one of: full, narrow, deferred');
    const unknown = await checks('nowhere');
    expect(unknown.code).toBe(1);
    expect(unknown.text).toContain('There is no territory nowhere');
  });
});
