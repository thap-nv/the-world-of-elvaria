// The size of a quest branch's change (PS-08b): lines added and removed since the fork point, generated files aside.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { fromPortable } from '@elvaria/store';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { TEST_HOST, commitFile, gitRepo, questId, territoryAt } from '../__fixtures__/git-repo.ts';
import { numstatLines } from './diff-size.ts';
import { createPlotManager } from './plot-manager.ts';

let root = '';
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria plot diff size '));
});
afterAll(() => rm(root, RM_TEMP));

const plots = () => createPlotManager({ kingdom: path.join(root, 'kingdom'), host: TEST_HOST });

describe('numstatLines', () => {
  it('adds the lines added and removed of each file, a binary file none', () => {
    const stdout = '3\t1\tsrc/a.ts\u00002\t0\tdocs/b.md\u0000-\t-\tlogo.png\u0000';
    expect(numstatLines(stdout, [])).toBe(6);
  });

  it('leaves out the files a glob covers, and anything that is not a numstat entry', () => {
    const stdout = '3\t1\tsrc/a.ts\u000040\t40\tdocs/schemas/quest.schema.json\u0000garbage\u0000';
    expect(numstatLines(stdout, ['docs/schemas/**'])).toBe(4);
    expect(numstatLines('', ['docs/**'])).toBe(0);
  });
});

describe('PlotManager.diffLines', () => {
  it("counts the branch's lines since its fork point, not the default branch's, generated files aside", async () => {
    const repo = await gitRepo(path.join(root, 'size repo'));
    await commitFile(repo, 'src/app.ts', 'one\ntwo\nthree\n');
    const prepared = await plots().prepare({ id: questId('d5e6f7') }, territoryAt(repo));
    if (!prepared.ok) throw new Error(prepared.error.detail);
    const { plot } = prepared.value;
    expect(await plots().diffLines(plot, [])).toBe(0);

    const worktree = fromPortable(plot.path!);
    // One line changed (one removed, one added), two added, and a generated file of five lines.
    await writeFile(path.join(worktree, 'src', 'app.ts'), 'one\n2\nthree\n');
    await commitFile(worktree, 'src/feature.ts', 'a\nb\n');
    await commitFile(worktree, 'docs/gen/out.md', '1\n2\n3\n4\n5\n');
    await commitFile(repo, 'later.txt', 'the default branch moving on is not the quest work\n');

    expect(await plots().diffLines(plot, ['docs/gen/**'])).toBe(4);
    expect(await plots().diffLines(plot, [])).toBe(9);
  });

  it('measures nothing in a plot without git', async () => {
    expect(await plots().diffLines({ type: 'none' }, [])).toBe(0);
  });
});
