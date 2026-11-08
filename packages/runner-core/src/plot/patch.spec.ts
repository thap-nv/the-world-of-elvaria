// The Steward applies an assignee's patch for laws.patch_paths before the submit commit (P1-28), on real git repos.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { fromPortable, pathExists } from '@elvaria/store';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST, commitFile, git, gitRepo, questId, territoryAt } from '../__fixtures__/git-repo.ts';
import { PATCH_FILE } from './patch.ts';
import { createPlotManager } from './plot-manager.ts';

let root = '';
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria plot patch '));
});
afterAll(() => rm(root, { recursive: true, force: true }));

const plots = () => createPlotManager({ kingdom: path.join(root, 'kingdom'), host: TEST_HOST });
const HUSKY = ['.husky/**'];

/** A worktree plot on a repo with a husky hook and a source file, and a patch written into it. */
async function plotWithPatch(suffix: string, patch?: string) {
  const repo = await gitRepo(path.join(root, `repo ${suffix}`));
  await commitFile(repo, '.husky/pre-push', 'pnpm test\n');
  await commitFile(repo, 'src/app.ts', 'export const app = 1;\n');
  const prepared = await plots().prepare({ id: questId(suffix) }, territoryAt(repo));
  if (!prepared.ok) throw new Error(`prepare failed: ${prepared.error.detail}`);
  const worktree = fromPortable(prepared.value.plot.path!);
  if (patch !== undefined) await writeFile(path.join(worktree, PATCH_FILE), patch);
  return { plot: prepared.value.plot, worktree };
}

const PRE_PUSH = [
  'diff --git a/.husky/pre-push b/.husky/pre-push',
  '--- a/.husky/pre-push',
  '+++ b/.husky/pre-push',
  // Miscounted on purpose, as a model writes them: `--recount` lets git count again.
  '@@ -1,4 +1,9 @@',
  ' pnpm test',
  '+pnpm lint',
  'diff --git a/.husky/pre-commit b/.husky/pre-commit',
  'new file mode 100755',
  '--- /dev/null',
  '+++ b/.husky/pre-commit',
  '@@ -0,0 +1 @@',
  '+pnpm lint-staged',
  '',
].join('\n');

const read = (worktree: string, file: string) => readFile(path.join(worktree, file), 'utf8');

describe('applyPatch', () => {
  it('applies a patch within the patch paths, then deletes it', async () => {
    const { plot, worktree } = await plotWithPatch('p1a2b3', PRE_PUSH);
    expect(await plots().applyPatch(plot, HUSKY)).toEqual({
      status: 'applied',
      paths: ['.husky/pre-commit', '.husky/pre-push'],
    });
    expect(await read(worktree, '.husky/pre-push')).toBe('pnpm test\npnpm lint\n');
    expect(await read(worktree, '.husky/pre-commit')).toBe('pnpm lint-staged\n');
    expect(await pathExists(path.join(worktree, PATCH_FILE))).toBe(false);
  });

  it('has nothing to do without a patch, without patch paths, or without git', async () => {
    const { plot, worktree } = await plotWithPatch('p2a2b3');
    expect(await plots().applyPatch(plot, HUSKY)).toEqual({ status: 'none' });
    await writeFile(path.join(worktree, PATCH_FILE), PRE_PUSH);
    // A territory that allows no patch path leaves the file as any other file of the work.
    expect(await plots().applyPatch(plot, [])).toEqual({ status: 'none' });
    expect(await pathExists(path.join(worktree, PATCH_FILE))).toBe(true);
    expect(await plots().applyPatch({ type: 'folder', path: 'quests/q/work' }, HUSKY)).toEqual({
      status: 'none',
    });
  });

  it.each([
    [
      'r1a2b3',
      'outside the patch paths',
      PRE_PUSH.replaceAll('.husky/pre-commit', 'src/hook.ts'),
      'it touches src/hook.ts, outside laws.patch_paths (.husky/**)',
    ],
    [
      'r2a2b3',
      'a rename out of a path the patch may not touch',
      'diff --git a/src/app.ts b/.husky/app.ts\nsimilarity index 100%\nrename from src/app.ts\nrename to .husky/app.ts\n',
      'it touches src/app.ts, outside laws.patch_paths',
    ],
    [
      'r3a2b3',
      "into git's own folder, even under a glob for everything",
      PRE_PUSH.replaceAll('.husky/pre-commit', '.git/hooks/pre-commit'),
      "it touches .git/hooks/pre-commit, git's own folder",
    ],
    ['r4a2b3', 'that is no patch', 'please add pnpm lint to the hook\n', 'git cannot read it as a patch'],
    [
      'r5a2b3',
      'that does not apply',
      PRE_PUSH.replace(' pnpm test', ' pnpm build'),
      'it does not apply: error: patch failed: .husky/pre-push:1',
    ],
  ])(
    '%s: refuses a patch %s, applies none of it and leaves it in the plot',
    async (suffix, _, patch, detail) => {
      const { plot, worktree } = await plotWithPatch(suffix, patch);
      const globs = detail.includes('own folder') ? ['**'] : HUSKY;
      const outcome = await plots().applyPatch(plot, globs);
      expect(outcome.status).toBe('refused');
      expect(outcome.status === 'refused' ? outcome.detail : '').toContain(detail);
      expect(await read(worktree, '.husky/pre-push')).toBe('pnpm test\n');
      expect(await pathExists(path.join(worktree, '.husky', 'pre-commit'))).toBe(false);
      expect(await pathExists(path.join(worktree, PATCH_FILE))).toBe(true);
      expect(git(worktree, 'status', '--porcelain')).toBe(`?? ${PATCH_FILE}`);
    },
  );
});
