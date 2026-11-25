import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeRunFile } from './run-file.ts';

describe('writeRunFile', () => {
  let runDir: string;
  let temp: TempDir;
  beforeEach(async () => {
    temp = await tempDir('run file');
    runDir = path.join(temp.root, '.runs', 'q-1');
  });
  afterEach(() => temp.remove());

  it('writes the file into the run folder, made if missing, and says where', async () => {
    const file = await writeRunFile(runDir, 'prompt.json', '{"user":"hi"}\n');
    expect(file).toBe(path.join(runDir, 'prompt.json'));
    expect(await readFile(file, 'utf8')).toBe('{"user":"hi"}\n');
  });

  it('refuses a name that would leave the run folder', async () => {
    for (const name of ['../kingdom.json', 'sub/settings.json', String.raw`sub\x.json`, '..', '.env', ''])
      await expect(writeRunFile(runDir, name, 'x')).rejects.toThrow(
        'a plain file name inside the run folder',
      );
  });
});
