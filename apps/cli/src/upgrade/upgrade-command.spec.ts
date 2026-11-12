// `elvaria upgrade` as the owner types it (PS-04b): the words it refuses, what it needs on PATH, and --rollback from
// the command line. Building and trying a build is in upgrade.spec.ts, on a fixture repo.
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SHA_A, SHA_B, placeBuild, readPin, writePin } from '../../test/builds.ts';
import { baseEnv, foundKingdom, run, tempDir, testIo } from '../../test/cli.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

describe('elvaria upgrade, the command', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
  });
  afterEach(() => dir.remove());

  const elvaria = (io: TestIo, ...words: string[]) => run(io, 'upgrade', ...words, '--locale', 'en');

  it('refuses --rollback with --ref, and needs a kingdom', async () => {
    const io = testIo();
    expect(await elvaria(io, '--rollback', '--ref', 'main', '--kingdom', kingdom)).toBe(2);
    expect(io.printed.err).toEqual(['--rollback does not go with --ref.']);
    expect(await elvaria(testIo({ env: baseEnv() }))).toBe(1);
  });

  it('needs git and pnpm on PATH before it builds anything', async () => {
    const io = testIo({ env: { ...baseEnv(), PATH: path.join(dir.root, 'empty') } });
    expect(await elvaria(io, '--kingdom', kingdom)).toBe(1);
    expect(io.printed.err).toEqual(['git is not on PATH: elvaria upgrade needs git and pnpm.']);
  });

  it('rolls back from the command line', async () => {
    await placeBuild(kingdom, SHA_B, {});
    await writePin(kingdom, SHA_A, SHA_B);
    const io = testIo();
    expect(await elvaria(io, '--rollback', '--kingdom', kingdom)).toBe(0);
    expect(await readPin(kingdom)).toMatchObject({ current: SHA_B, previous: SHA_A });
  });
});
