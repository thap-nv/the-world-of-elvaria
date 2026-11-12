// The spawn probe of the conformance suite (P1-12e): the script a session's shell runs, and how fakes run it.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import {
  SPAWN_PROBE_COMMAND,
  SPAWN_PROBE_OK,
  readSpawnProbe,
  runFakeShellLine,
  runSpawnProbe,
  writeSpawnProbe,
} from './spawn-probe.ts';

describe('the spawn probe', () => {
  let plot: string;
  beforeEach(async () => {
    plot = await mkdtemp(path.join(tmpdir(), 'elvaria spawn probe '));
  });
  afterEach(() => rm(plot, RM_TEMP));

  it('leaves nothing until it runs', async () => {
    await writeSpawnProbe(plot);
    expect(await readSpawnProbe(plot)).toBeUndefined();
  });

  it('starts a child with piped stdio and writes what it printed next to itself', async () => {
    await writeSpawnProbe(plot);
    await runSpawnProbe(plot);
    expect(await readSpawnProbe(plot)).toBe(SPAWN_PROBE_OK);
  });

  it('runs in a fake shell only as the line the suite asks for', async () => {
    await writeSpawnProbe(plot);
    runFakeShellLine('git push origin HEAD', plot);
    expect(await readSpawnProbe(plot)).toBeUndefined();
    runFakeShellLine(SPAWN_PROBE_COMMAND, plot);
    expect(await readSpawnProbe(plot)).toBe(SPAWN_PROBE_OK);
  });
});
