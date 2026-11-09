import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { pathExists } from '@elvaria/store';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST, commitFile, git, gitRepo, questId, territoryAt } from '../__fixtures__/git-repo.ts';
import { createPlotManager } from './plot-manager.ts';
import { PLOT_RECORD_FILE } from './plot-record.ts';
import { scratchIdOf } from './scratch.ts';
import { setupLogOf } from './setup.ts';

let root = '';
let kingdom = '';
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria scratch '));
  kingdom = path.join(root, 'my kingdom');
  await mkdir(kingdom);
});
afterAll(() => rm(root, { recursive: true, force: true }));

const forgotten: string[] = [];
let manager = createPlotManager({ kingdom: '.', host: TEST_HOST });
beforeAll(() => {
  // The kingdom exists only once the first beforeAll ran: setup logs go there.
  manager = createPlotManager({
    kingdom,
    host: TEST_HOST,
    forget: [(worktree) => Promise.resolve(void forgotten.push(worktree))],
  });
});

/** A repo whose quest branch holds one commit of work on top of main. */
async function questOn(folder: string, suffix: string, fields: Record<string, unknown> = {}) {
  const repo = await gitRepo(path.join(root, folder));
  const territory = territoryAt(repo, fields);
  const quest = { id: questId(suffix) };
  const prepared = await manager.prepare(quest, territory);
  if (!prepared.ok) throw new Error(prepared.error.detail);
  const worktree = path.join(repo, '.elvaria', 'worktrees', quest.id);
  await commitFile(worktree, 'src/sum.mjs', 'export const sum = (a, b) => a + b;\n', 'work');
  return { repo, territory, quest, worktree, main: git(repo, 'rev-parse', 'main') };
}

describe('the scratch plot of a judge (ADR 0022)', () => {
  it("stands detached at the head of the quest's branch, beside its worktree, after setup", async () => {
    const setup = "node -e \"require('node:fs').writeFileSync('set.txt', 'up')\"";
    const { repo, territory, quest, worktree, main } = await questOn('Tool - DC1', 'a1b2c3', {
      commands: { setup },
    });
    const head = git(worktree, 'rev-parse', 'HEAD');
    const made = await manager.prepareScratch(quest, territory);
    expect(made).toMatchObject({ ok: true });
    if (!made.ok) return;
    const scratch = path.join(repo, '.elvaria', 'worktrees', scratchIdOf(quest.id));
    expect(made.value).toMatchObject({ worktree: scratch, base: main, head });
    expect(made.value.plot).toEqual({ type: 'worktree', path: scratch.replaceAll('\\', '/') });
    expect(git(scratch, 'rev-parse', 'HEAD')).toBe(head);
    expect(() => git(scratch, 'symbolic-ref', '-q', 'HEAD')).toThrow();
    expect(await readFile(path.join(scratch, 'set.txt'), 'utf8')).toBe('up');
    expect(await pathExists(path.join(kingdom, ...setupLogOf(scratchIdOf(quest.id)).split('/')))).toBe(true);
    const record: unknown = JSON.parse(
      await readFile(path.join(git(scratch, 'rev-parse', '--git-dir'), PLOT_RECORD_FILE), 'utf8'),
    );
    expect(record).toMatchObject({ base: main, setup_done: true });
    // The fixture's commit took the quest plot's set.txt along: the branch's own change.
    expect(await manager.touched(made.value.plot)).toEqual(['set.txt', 'src/sum.mjs']);
    expect(await manager.scratchOf(quest, territory)).toBe(scratch);
  }, 60_000);

  it('is made fresh for each judge, moves to the base and back, and goes dirty or not', async () => {
    const { repo, territory, quest, main } = await questOn('fresh', 'b2c3d4');
    const first = await manager.prepareScratch(quest, territory);
    if (!first.ok) throw new Error(first.error.detail);
    const scratch = first.value.worktree;
    await writeFile(path.join(scratch, 'src', 'sum.mjs'), 'export const sum = (a, b) => a - b;\n');
    await writeFile(path.join(scratch, 'broken.txt'), 'x');
    const second = await manager.prepareScratch(quest, territory);
    if (!second.ok) throw new Error(second.error.detail);
    expect(git(scratch, 'status', '--porcelain')).toBe('');
    expect(forgotten).toContain(scratch);
    await writeFile(path.join(scratch, 'src', 'sum.mjs'), 'broken');
    await manager.checkoutScratch(second.value, main);
    expect(await pathExists(path.join(scratch, 'src', 'sum.mjs'))).toBe(false);
    await manager.checkoutScratch(second.value, second.value.head);
    expect(git(scratch, 'status', '--porcelain')).toBe('');
    await writeFile(path.join(scratch, 'src', 'sum.mjs'), 'broken again');
    expect(await manager.releaseScratch(quest, territory)).toBeUndefined();
    expect(await pathExists(scratch)).toBe(false);
    expect(await manager.scratchOf(quest, territory)).toBeUndefined();
    expect(git(repo, 'worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(2);
    // Nothing done in the scratch plot reached the quest's branch.
    expect(git(repo, 'show', `quest/${quest.id}:src/sum.mjs`)).toBe('export const sum = (a, b) => a + b;');
  }, 60_000);

  it('says why it cannot be made: no quest plot, a folder in the way, a setup that fails', async () => {
    const repo = await gitRepo(path.join(root, 'refusals'));
    const missing = await manager.prepareScratch({ id: questId('c3d4e5') }, territoryAt(repo));
    expect(missing).toMatchObject({ ok: false, error: { reason: 'git_failed' } });
    const { territory, quest } = await questOn('blocked', 'd4e5f6');
    const scratch = path.join(fromRepo(territory.path), '.elvaria', 'worktrees', scratchIdOf(quest.id));
    await mkdir(scratch, { recursive: true });
    await writeFile(path.join(scratch, 'owner.txt'), 'mine');
    expect(await manager.prepareScratch(quest, territory)).toMatchObject({
      ok: false,
      error: { reason: 'path_taken' },
    });
    await rm(scratch, { recursive: true, force: true });
    const failing = { ...territory, commands: { setup: 'node -e "process.exit(3)"' } };
    expect(await manager.prepareScratch(quest, failing)).toMatchObject({
      ok: false,
      error: { reason: 'setup_failed', log_path: setupLogOf(scratchIdOf(quest.id)) },
    });
  }, 60_000);

  it('has none on a folder territory', async () => {
    const folder = territoryAt(path.join(root, 'docs'), { vcs: { type: 'none' } });
    const quest = { id: questId('e5f6g7') };
    expect(await manager.prepareScratch(quest, folder)).toMatchObject({
      ok: false,
      error: { reason: 'not_a_repo' },
    });
    expect(await manager.releaseScratch(quest, folder)).toBeUndefined();
    expect(await manager.scratchOf(quest, folder)).toBeUndefined();
  });
});

const fromRepo = (portable: string): string => portable.split('/').join(path.sep);
