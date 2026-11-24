import { existsSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { tempDir } from './temp-dir.ts';

describe('tempDir', () => {
  it('makes an empty folder in the OS temp folder, named with a space', async () => {
    const dir = await tempDir('probe');
    try {
      expect(path.dirname(dir.root)).toBe(path.resolve(tmpdir()));
      expect(path.basename(dir.root)).toMatch(/^elvaria probe \S+$/);
      expect(await readdir(dir.root)).toEqual([]);
    } finally {
      await dir.remove();
    }
  });

  it('gives each call its own folder', async () => {
    const [first, second] = await Promise.all([tempDir('twin'), tempDir('twin')]);
    expect(first.root).not.toBe(second.root);
    await Promise.all([first.remove(), second.remove()]);
  });

  it('removes the folder with what is in it, and a second remove is fine', async () => {
    const dir = await tempDir('full');
    await mkdir(path.join(dir.root, 'a b', 'c'), { recursive: true });
    await writeFile(path.join(dir.root, 'a b', 'c', 'file.txt'), 'x');
    await dir.remove();
    expect(existsSync(dir.root)).toBe(false);
    await expect(dir.remove()).resolves.toBeUndefined();
  });
});
