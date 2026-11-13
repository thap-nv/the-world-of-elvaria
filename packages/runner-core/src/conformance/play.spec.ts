import { access, rm } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as FsPromises from 'node:fs/promises';

// rm stays the real one unless a test holds the workspaces: a real EBUSY needs a process that keeps the folder, which
// only Windows refuses to delete, and the retries of a real failure would make each test take 5.5 s.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return { ...actual, rm: vi.fn(actual.rm) };
});

import { createFakeRunner } from '../runner/fake-runner.ts';
import { CONFORMANCE_CHECKS, runConformance } from './checks.ts';
import type { FakeRunnerOptions } from '../runner/fake-runner.ts';
import type { ConformanceTarget, LeftWorkspace } from './target.ts';

const { rm: realRm } = await vi.importActual<typeof FsPromises>('node:fs/promises');

/** The workspaces the suite could not remove in this test, which the test removes once done. */
let held: string[] = [];

/** Every workspace of the suite refuses to go, as agy's did on Windows (2026-11-12); any other rm is the real one. */
function holdWorkspaces(): void {
  vi.mocked(rm).mockImplementation(async (target, options) => {
    const dir = String(target);
    if (!path.basename(dir).startsWith('elvaria conformance ')) return realRm(target, options);
    held.push(dir);
    throw Object.assign(new Error(`EBUSY: resource busy or locked, rmdir '${dir}'`), { code: 'EBUSY' });
  });
}

afterEach(async () => {
  vi.mocked(rm).mockImplementation(realRm);
  await Promise.all(held.map((dir) => realRm(dir, { recursive: true, force: true })));
  held = [];
});

const heldTarget = (left: LeftWorkspace[], options: FakeRunnerOptions = {}): ConformanceTarget => ({
  name: 'held',
  createRunner: () => createFakeRunner(options),
  onLeftover: (leftover) => left.push(leftover),
});

const submit = CONFORMANCE_CHECKS.find(({ id }) => id === 'submit');

describe('a workspace the suite cannot remove (lessons of 2026-11-12)', () => {
  it('stays on disk and is told, and the check passes on what its session did', async () => {
    holdWorkspaces();
    const left: LeftWorkspace[] = [];
    expect(await submit?.run(heldTarget(left))).toBe('passed');
    expect(left).toEqual([
      { scenario: 'submit', dir: held[0], problem: expect.stringMatching(/^EBUSY: resource busy/) as string },
    ]);
    await expect(access(held[0] ?? '')).resolves.toBeUndefined();
  });

  it("leaves a failing check its own failure, which the cleanup's used to hide", async () => {
    holdWorkspaces();
    const left: LeftWorkspace[] = [];
    // Every session submits, so the crash check fails on the outcome it reads.
    const reports = await runConformance(heldTarget(left, { scenarioOf: () => 'submit' }));
    const crash = reports.find(({ id }) => id === 'crash');
    expect(crash?.outcome).toBe('failed');
    expect(crash?.problem).not.toContain('EBUSY');
    expect(crash?.problem).toContain("'error'");
    expect(reports.find(({ id }) => id === 'submit')?.outcome).toBe('passed');
    expect(left.map(({ scenario }) => scenario)).toEqual(expect.arrayContaining(['submit', 'crash', 'hang']));
  });

  it('warns the process when the target listens for nothing', async () => {
    holdWorkspaces();
    const warned = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
    try {
      expect(await submit?.run({ name: 'quiet', createRunner: () => createFakeRunner() })).toBe('passed');
      expect(warned).toHaveBeenCalledWith(
        expect.stringMatching(/^conformance submit: the workspace stays, remove it by hand: .+ \(EBUSY: /),
      );
    } finally {
      warned.mockRestore();
    }
  });
});
