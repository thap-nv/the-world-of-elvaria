import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { fromPortable } from '@elvaria/store';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TEST_HOST, commitFile, gitRepo, questId, territoryAt } from '../__fixtures__/git-repo.ts';
import { DIFF_MAX_CHARS, cappedDiff } from './diff.ts';
import { createPlotManager } from './plot-manager.ts';

let root = '';
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria plot diff '));
});
afterAll(() => rm(root, { recursive: true, force: true }));

const plots = () => createPlotManager({ kingdom: path.join(root, 'kingdom'), host: TEST_HOST });

describe('PlotManager.diff (P1-15)', () => {
  it('gives the branch against its fork point: summary, then the patch', async () => {
    const repo = await gitRepo(path.join(root, 'diff repo'));
    await commitFile(repo, 'src/app.ts', 'export const app = 1;\n');
    const prepared = await plots().prepare({ id: questId('d1e2f3') }, territoryAt(repo));
    if (!prepared.ok) throw new Error(prepared.error.detail);
    const { plot } = prepared.value;
    expect(await plots().diff(plot)).toBe('');

    const worktree = fromPortable(plot.path!);
    await writeFile(path.join(worktree, 'src', 'app.ts'), 'export const app = 2;\n');
    await commitFile(worktree, 'src/feature.ts', 'export const feature = 1;\n');
    // The default branch moving on is not the quest's work.
    await commitFile(repo, 'later.txt', 'later\n');

    const diff = (await plots().diff(plot)) ?? '';
    expect(diff).toMatch(/^ src\/app\.ts +\| 2 \+-\n src\/feature\.ts +\| 1 \+\n 2 files changed/);
    expect(diff).toContain('+export const app = 2;');
    expect(diff).toContain('+export const feature = 1;');
    expect(diff).not.toContain('later.txt');
  }, 30_000);

  it('has nothing to say for a plot without git', async () => {
    expect(await plots().diff({ type: 'folder', path: 'quests/q_20261107_e2f3a4/work' })).toBeNull();
    expect(await plots().diff({ type: 'none' })).toBeNull();
  });
});

describe('cappedDiff', () => {
  const stat = ' a.ts | 400 +\n 1 file changed, 400 insertions(+)\n';
  const patch = Array.from({ length: 400 }, (_, n) => `+line ${n} ${'x'.repeat(60)}`).join('\n');

  it('keeps a diff that fits whole, and gives nothing for an empty patch', () => {
    expect(cappedDiff(stat, '+a\n', 'b...HEAD')).toBe(`${stat.trimEnd()}\n\n+a`);
    expect(cappedDiff(stat, '  \n', 'b...HEAD')).toBe('');
  });

  it('cuts a long patch at a line end and says where the rest is', () => {
    const cut = cappedDiff(stat, patch, 'b...HEAD');
    expect(cut.length).toBeLessThanOrEqual(DIFF_MAX_CHARS);
    expect(cut.startsWith(stat.trimEnd())).toBe(true);
    const lines = cut.split('\n');
    expect(lines.at(-1)).toBe(
      `[diff cut at ${DIFF_MAX_CHARS} characters; the rest is in the plot: git diff b...HEAD]`,
    );
    expect(lines.at(-2)).toMatch(/^\+line \d+ x{60}$/);
    expect(cappedDiff(stat, patch, 'b...HEAD', 100).length).toBeLessThanOrEqual(100 + stat.length);
  });
});
