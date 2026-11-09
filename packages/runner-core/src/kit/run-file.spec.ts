import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeRunFile } from './run-file.ts';

describe('writeRunFile', () => {
  let runDir: string;
  beforeEach(async () => {
    runDir = path.join(await mkdtemp(path.join(tmpdir(), 'elvaria run file ')), '.runs', 'q-1');
  });
  afterEach(() => rm(path.dirname(path.dirname(runDir)), { recursive: true, force: true }));

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
