import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { fromPortable, pathExists } from '@elvaria/store';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { TEST_HOST, commitFile, git, gitRepo, questId, territoryAt } from '../__fixtures__/git-repo.ts';
import { plotCommitMessage } from './commit-message.ts';
import { createPlotManager } from './plot-manager.ts';
import { SET_ASIDE_DIR, WIP_PATCH_FILE, isScratchFile } from './rescue.ts';

let root = '';
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria plot rescue '));
});
afterAll(() => rm(root, RM_TEMP));

const plots = () => createPlotManager({ kingdom: path.join(root, 'kingdom'), host: TEST_HOST });
const runDir = (name: string) => path.join(root, 'kingdom', '.runs', name);

async function preparedPlot(name: string, suffix: string) {
  const repo = await gitRepo(path.join(root, name));
  await commitFile(repo, 'src/app.ts', 'export const app = 1;\n');
  const prepared = await plots().prepare({ id: questId(suffix) }, territoryAt(repo));
  if (!prepared.ok) throw new Error(`prepare failed: ${prepared.error.detail}`);
  return { repo, plot: prepared.value.plot, worktree: fromPortable(prepared.value.plot.path!) };
}

describe('isScratchFile', () => {
  it.each([
    ['quests-handover-tmp.txt', true],
    ['tmp.json', true],
    ['notes_temp', true],
    ['notes.tmp.md', true],
    ['server.js.bak', true],
    ['merge.orig', true],
    ['patch.rej', true],
    ['.app.ts.swp', true],
    ['draft~', true],
    ['template.md', false],
    ['attempt.ts', false],
    ['Dockerfile', false],
    ['README.md', false],
    // Only the plot's root: a file in a folder is part of the work.
    ['src/tmp/helper.ts', false],
    ['docs/notes.bak', false],
  ])('%s: %s', (name, scratch) => {
    expect(isScratchFile(name)).toBe(scratch);
  });
});

describe('commitAll with a rescue folder (P1-55)', () => {
  it('sets the scratch files at the root aside, and commits the rest', async () => {
    const { repo, plot, worktree } = await preparedPlot('aside repo', 'a1b2c3');
    await writeFile(path.join(repo, '.gitignore'), 'ignored.tmp\n');
    git(repo, 'add', '.gitignore');
    git(repo, 'commit', '-q', '-m', 'ignore');
    git(worktree, 'merge', '-q', 'main');
    await writeFile(path.join(worktree, 'src', 'app.ts'), 'export const app = 2;\n');
    await writeFile(path.join(worktree, 'quests-handover-tmp.txt'), 'x\n');
    await writeFile(path.join(worktree, 'ignored.tmp'), 'ignored\n');
    await writeFile(path.join(worktree, 'Dockerfile'), 'FROM node\n');
    const rescue = { dir: runDir('q_20261107_a1b2c3-1') };

    const outcome = await plots().commitAll(plot, plotCommitMessage.submit(questId('a1b2c3')), rescue);

    expect(outcome).toEqual({
      status: 'committed',
      sha: git(worktree, 'rev-parse', 'HEAD'),
      set_aside: ['quests-handover-tmp.txt'],
    });
    expect(git(worktree, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort()).toEqual([
      'Dockerfile',
      'src/app.ts',
    ]);
    // Moved, not deleted; out of the plot, so nothing is left for a later merge or release to refuse.
    expect(await readFile(path.join(rescue.dir, SET_ASIDE_DIR, 'quests-handover-tmp.txt'), 'utf8')).toBe(
      'x\n',
    );
    expect(await pathExists(path.join(worktree, 'quests-handover-tmp.txt'))).toBe(false);
    expect(await pathExists(path.join(worktree, 'ignored.tmp'))).toBe(true);
    expect(await plots().status(plot)).toMatchObject({ dirty: false });
  });

  it('says clean when the scratch file was all there was, and keeps a nested one in the work', async () => {
    const { plot, worktree } = await preparedPlot('clean repo', 'b2c3d4');
    await writeFile(path.join(worktree, 'draft~'), 'x\n');
    const rescue = { dir: runDir('q_20261107_b2c3d4-1') };
    expect(await plots().commitAll(plot, 'submit', rescue)).toEqual({
      status: 'clean',
      set_aside: ['draft~'],
    });

    await commitFile(worktree, 'src/tmp/helper.ts', 'export const helper = 1;\n');
    expect(await plots().commitAll(plot, 'submit', rescue)).toEqual({ status: 'clean' });
  });

  it('commits scratch files as before when it is given no rescue folder', async () => {
    const { plot, worktree } = await preparedPlot('plain repo', 'c3d4e5');
    await writeFile(path.join(worktree, 'quests-handover-tmp.txt'), 'x\n');
    const outcome = await plots().commitAll(plot, 'submit');
    expect(outcome.status).toBe('committed');
    expect(git(worktree, 'show', '--name-only', '--format=', 'HEAD')).toBe('quests-handover-tmp.txt');
  });

  it("copies what the territory's hook refused to a patch, and names its files", async () => {
    const { repo, plot, worktree } = await preparedPlot('hooked rescue repo', 'd4e5f6');
    const hook = path.join(repo, '.git', 'hooks', 'pre-commit');
    await writeFile(hook, '#!/bin/sh\necho "lint failed: src/app.ts" >&2\nexit 1\n');
    await chmod(hook, 0o755);
    await writeFile(path.join(worktree, 'src', 'app.ts'), 'export const app = 5;\n');
    await writeFile(path.join(worktree, 'src', 'extra.ts'), 'export const extra = 1;\n');
    const rescue = { dir: runDir('q_20261107_d4e5f6-1') };

    const outcome = await plots().commitAll(plot, plotCommitMessage.wip(questId('d4e5f6'), 'tokens'), rescue);

    expect(outcome).toEqual({
      status: 'refused',
      detail: 'lint failed: src/app.ts',
      patch: path.join(rescue.dir, WIP_PATCH_FILE),
      files: ['src/app.ts', 'src/extra.ts'],
    });
    const patch = await readFile(path.join(rescue.dir, WIP_PATCH_FILE), 'utf8');
    expect(patch).toContain('+export const app = 5;');
    expect(patch).toContain('+++ b/src/extra.ts');
    // The work stays staged in the plot as well.
    expect(await plots().status(plot)).toMatchObject({ dirty: true, ahead: 0 });
  });
});
