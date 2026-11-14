// `doctor` in the trial of `elvaria upgrade` (fix/held-tribe-sessions): a tribe the Steward holds anyway (its pinned
// CLI gone, as Codex's after a VS Code update on 2026-11-14) only warns, so the upgrade is not refused for it; the
// owner's own `doctor` still fails on it.
import path from 'node:path';

import { rm } from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  RM_TEMP,
  baseEnv,
  fakeTool,
  foundKingdom,
  isolatedPath,
  printed,
  run,
  tempDir,
  testIo,
} from '../../test/cli.ts';
import { UPGRADE_TRIAL_ENV } from './held-in-trial.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

describe('elvaria doctor in the trial of an upgrade', () => {
  let dir: TempDir;
  let kingdom: string;
  let bin: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    bin = path.join(dir.root, 'bin');
    await fakeTool(bin, 'claude', '2.1.318 (Claude Code)');
    await fakeTool(bin, 'agy', '1.5.2');
  });
  afterEach(() => dir.remove());

  const doctorIo = async (extra: Record<string, string> = {}): Promise<TestIo> =>
    testIo({ env: { ...baseEnv(await isolatedPath(bin)), ...extra } });
  const doctor = (io: TestIo, ...args: string[]) =>
    run(io, 'doctor', ...args, '--kingdom', kingdom, '--locale', 'en');

  it("warns of a tribe whose pinned CLI is gone, which the owner's doctor fails on", async () => {
    const old = await fakeTool(path.join(dir.root, 'claude-code-2.1.318'), 'claude', '2.1.318');
    expect(await doctor(await doctorIo(), '--tool', `claude=${old}`, '--acknowledge-terms', 'gemini')).toBe(
      0,
    );
    await rm(path.dirname(old), RM_TEMP);
    const owner = await doctorIo();
    expect(await doctor(owner)).toBe(1);
    const trial = await doctorIo({ [UPGRADE_TRIAL_ENV]: '1' });
    expect(await doctor(trial)).toBe(0);
    const lines = printed(trial);
    expect(lines).toContain(`! Tribe claude: the pinned ${old.replaceAll('\\', '/')} is gone; found `);
    expect(lines).toContain('! Tribe claude is held (its CLI changed version or is gone)');
    expect(lines).toContain('until elvaria tribe check claude passes');
    expect(lines).not.toContain('✗ Tribe claude');
  });

  it('still fails on a tribe the Steward would not hold', async () => {
    // Gemini's terms are not acknowledged: an error of the tribe itself, its CLI found and unchanged.
    const trial = await doctorIo({ [UPGRADE_TRIAL_ENV]: '1' });
    expect(await doctor(trial)).toBe(1);
    expect(printed(trial)).toContain('✗ Tribe gemini');
    expect(printed(trial)).not.toContain('is held');
  });
});
