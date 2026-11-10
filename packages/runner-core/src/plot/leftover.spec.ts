// clearLeftover (P1-11): the folder git keeps after `git worktree remove` on Windows, pnpm's dead junctions in it.
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { pathExists } from '@elvaria/store';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { clearLeftover } from './leftover.ts';

let root = '';
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria leftover '));
});
afterAll(() => rm(root, RM_TEMP));

/** A directory link as pnpm makes it: a junction on Windows (no privilege needed), a symlink elsewhere. */
const link = (target: string, at: string) =>
  symlink(target, at, process.platform === 'win32' ? 'junction' : 'dir');

/** The skeleton git leaves: folders, a live link, and a link whose target git already deleted. */
async function skeleton(name: string): Promise<string> {
  const plot = path.join(root, name);
  const store = path.join(plot, 'node_modules', '.pnpm', 'left-pad', 'node_modules', 'left-pad');
  await mkdir(store, { recursive: true });
  await mkdir(path.join(plot, 'apps', 'api', 'node_modules'), { recursive: true });
  await link(store, path.join(plot, 'node_modules', 'left-pad'));
  const gone = path.join(plot, 'node_modules', '.pnpm', 'gone');
  await mkdir(gone);
  await link(gone, path.join(plot, 'apps', 'api', 'node_modules', 'gone'));
  await rm(gone, RM_TEMP);
  return plot;
}

describe('clearLeftover', () => {
  it('says nothing when the folder is already gone', async () => {
    expect(await clearLeftover(path.join(root, 'never there'))).toBeUndefined();
  });

  it('removes folders that hold only links into themselves, dead ones included', async () => {
    const plot = await skeleton('only links');
    expect(await clearLeftover(plot)).toBeUndefined();
    expect(await pathExists(plot)).toBe(false);
  });

  it('keeps a folder that still holds a file, and says which', async () => {
    const plot = await skeleton('with a file');
    await writeFile(path.join(plot, 'apps', 'notes.md'), 'kept\n');
    expect(await clearLeftover(plot)).toBe(`${path.join(plot, 'apps', 'notes.md')} is still there`);
    expect(await pathExists(plot)).toBe(true);
  });

  it('keeps a folder with a link out of it, and never touches what that link points to', async () => {
    const plot = await skeleton('link out');
    const outside = path.join(root, 'outside store');
    await mkdir(outside);
    await writeFile(path.join(outside, 'index.js'), '');
    await link(outside, path.join(plot, 'node_modules', 'outside'));
    expect(await clearLeftover(plot)).toMatch(/links to .*outside store, outside the plot$/);
    expect(await readdir(outside)).toEqual(['index.js']);
  });
});
