// `elvaria tribe check <id> --tool <path>` (PS-04b): the suite against another CLI than the pinned one, writing
// nothing. `elvaria upgrade` runs a new build's suite this way, against the fake CLI the build carries.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, printed, run, tempDir, testIo } from '../../test/cli.ts';
import { FAKE_LANTERN, LANTERN_ADAPTER, installLantern } from '../../test/lantern.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

describe('elvaria tribe check --tool', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    await installLantern(kingdom);
  });
  afterEach(() => dir.remove());

  const elvaria = (io: TestIo, ...args: string[]) => run(io, ...args, '--kingdom', kingdom, '--locale', 'en');
  const kingdomFile = () => readFile(path.join(kingdom, 'kingdom.json'), 'utf8');

  it('runs the suite against the CLI named, leaves kingdom.json as it was and the tribe disabled', async () => {
    await elvaria(testIo(), 'tribe', 'add', 'lantern', '--adapter', LANTERN_ADAPTER);
    const before = await kingdomFile();
    const io = testIo({ cwd: path.dirname(FAKE_LANTERN) });
    const tool = path.basename(FAKE_LANTERN);
    expect(await elvaria(io, 'tribe', 'check', 'lantern', '--scenarios', '--tool', tool)).toBe(0);
    expect(io.printed.out.at(-1)).toBe(
      `Tribe lantern passes the conformance suite with ${FAKE_LANTERN}; kingdom.json is unchanged.`,
    );
    expect(await kingdomFile()).toBe(before);
  });

  it('fails as without it when the CLI named does not answer', async () => {
    await elvaria(testIo(), 'tribe', 'add', 'lantern', '--adapter', LANTERN_ADAPTER);
    const io = testIo();
    const missing = path.join(dir.root, 'no lantern.mjs');
    expect(await elvaria(io, 'tribe', 'check', 'lantern', '--scenarios', '--tool', missing)).toBe(1);
    expect(printed(io)).toContain('Tribe lantern does not pass, so it stays disabled.');
  });
});
