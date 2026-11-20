// The sweep of workspaces a killed conformance turn left behind, and openWorkspace calling it.
import { access, mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { STALE_AFTER_MS, WORKSPACE_PREFIX, sweepStaleWorkspaces } from './sweep.ts';
import { openWorkspace } from './workspace.ts';

const NOW = Date.parse('2026-11-20T12:00:00Z');
const exists = (p: string) =>
  access(p).then(
    () => true,
    () => false,
  );

describe('sweepStaleWorkspaces', () => {
  let tmp: string;
  beforeEach(async () => {
    tmp = await mkdtemp(path.join(tmpdir(), 'elvaria sweep '));
  });
  afterEach(() => rm(tmp, { ...RM_TEMP }));

  /** A workspace folder (with a file inside, as a real one has) last touched `ageMs` before NOW. */
  const made = async (name: string, ageMs: number) => {
    const folder = path.join(tmp, name);
    await mkdir(path.join(folder, 'plot'), { recursive: true });
    await writeFile(path.join(folder, 'plot', 'a.txt'), 'x');
    const touched = (NOW - ageMs) / 1000;
    await utimes(folder, touched, touched);
    return folder;
  };

  it('removes the old workspaces and keeps the young ones, other folders and plain files', async () => {
    const old = await made(`${WORKSPACE_PREFIX}old`, STALE_AFTER_MS + 1000);
    const young = await made(`${WORKSPACE_PREFIX}young`, STALE_AFTER_MS - 60_000);
    const other = await made('elvaria environment old', STALE_AFTER_MS * 5);
    const file = path.join(tmp, `${WORKSPACE_PREFIX}file`);
    await writeFile(file, 'x');
    await utimes(file, 0, 0);

    expect(await sweepStaleWorkspaces({ tmp, now: () => NOW })).toBe(1);
    expect(await exists(old)).toBe(false);
    expect(await Promise.all([young, other, file].map(exists))).toEqual([true, true, true]);
  });

  it('takes the age from the options when they give one', async () => {
    const folder = await made(`${WORKSPACE_PREFIX}a`, 5000);
    expect(await sweepStaleWorkspaces({ tmp, now: () => NOW, staleAfterMs: 1000 })).toBe(1);
    expect(await exists(folder)).toBe(false);
  });

  it('is no error when the temp folder is missing', async () => {
    expect(await sweepStaleWorkspaces({ tmp: path.join(tmp, 'nowhere'), now: () => NOW })).toBe(0);
  });

  it('is what openWorkspace does first, with its own folder made after the sweep', async () => {
    const old = await made(`${WORKSPACE_PREFIX}old`, STALE_AFTER_MS * 2);
    const workspace = await openWorkspace({ tmp, now: () => NOW });
    expect(await exists(old)).toBe(false);
    expect(path.dirname(workspace.root)).toBe(tmp);
    expect(await exists(workspace.plot)).toBe(true);
    await workspace.remove();
  });
});
