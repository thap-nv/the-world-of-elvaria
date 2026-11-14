// `doctor` and the last trial of each territory (PS-25): never tried, failed, tried on other commands, or passed;
// each a warning or a ✓, never an error.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { baseEnv, foundKingdom, isolatedPath, printed, run, tempDir, testIo } from '../../test/cli.ts';
import { FULL, attachDemo, fillDemo, patientIo } from '../../test/trial.ts';
import type { TempDir } from '../../test/cli.ts';

/**
 * The five lines doctor writes of territory demo's trial, by their own words. Not by a word a path may hold: run in
 * Elvaria's own trial plot (`.elvaria/worktrees/trial-elvaria`), the Build line's folder said "trial" too, and three
 * tests went red in `territory check elvaria` (2026-11-13).
 */
const TRIAL_LINE =
  /^[!✓✗] (?:Territory demo (?:was never tried|failed its trial)|Territory demo: passed its trial|Territory demo's commands\.setup or checks changed since its trial|The last trial of territory demo )/;

/** The lines of a doctor run on `kingdom` that speak of the trial; none may be an error. */
async function trialLinesOf(kingdom: string): Promise<string[]> {
  const io = testIo({ env: baseEnv(await isolatedPath()) });
  await run(io, 'doctor', '--kingdom', kingdom, '--locale', 'en');
  const lines = printed(io)
    .split('\n')
    .filter((line) => TRIAL_LINE.test(line));
  expect(lines.filter((line) => line.startsWith('✗'))).toEqual([]);
  return lines;
}

describe('elvaria doctor: the territory trial (PS-25)', () => {
  let dir: TempDir;
  let kingdom: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    await attachDemo(dir.root, kingdom);
  });
  afterEach(() => dir.remove());

  const trialLines = () => trialLinesOf(kingdom);
  const tryDemo = () => run(patientIo(), 'territory', 'check', 'demo', '--kingdom', kingdom);

  it('reminds of a territory never tried', async () => {
    expect(await trialLines()).toEqual([
      '! Territory demo was never tried: run elvaria territory check demo before its first quest.',
    ]);
  });

  it('says when the trial passed, with the other items that did not', async () => {
    await fillDemo(kingdom, FULL);
    await tryDemo();
    const [line = ''] = await trialLines();
    // No gazetteer: that item fails; the ledger is empty, so its two rates are not measured.
    expect(line).toMatch(
      /^✓ Territory demo: passed its trial at 2026-11-06 \d\d:\d\d; 1 other items of its scorecard do not/,
    );
  });

  it('says when no item failed', async () => {
    await fillDemo(kingdom, FULL);
    const items = {
      trial: 'pass',
      check_time: 'pass',
      set_aside: 'unmeasured',
      gazetteer: 'pass',
      paths: 'pass',
    };
    const record = {
      version: 1,
      territory: 'demo',
      tried_at: '2026-11-06T09:00:00+07:00',
      base: '0123456789ab',
      items: { ...items, first_pass: 'unmeasured' },
      commands: ['commands.setup: node setup.mjs', 'checks.unit.run: node unit.mjs'],
    };
    await mkdir(path.join(kingdom, '.state', 'territory-trials'), { recursive: true });
    await writeFile(path.join(kingdom, '.state', 'territory-trials', 'demo.json'), JSON.stringify(record));
    expect(await trialLines()).toEqual(['✓ Territory demo: passed its trial at 2026-11-06 09:00.']);
  });

  it('warns of a failed trial, and of one that tried other commands than the territory has now', async () => {
    await fillDemo(kingdom, { ...FULL, commands: { setup: 'node broken-setup.mjs' } });
    await tryDemo();
    expect((await trialLines())[0]).toMatch(/^! Territory demo failed its trial at /);
    await fillDemo(kingdom, FULL);
    await tryDemo();
    await fillDemo(kingdom, { ...FULL, checks: [{ ...FULL.checks[0], run: 'node red.mjs' }] });
    expect((await trialLines())[0]).toMatch(
      /^! Territory demo's commands.setup or checks changed since its trial at /,
    );
  });

  it('warns of a record it cannot read', async () => {
    await mkdir(path.join(kingdom, '.state', 'territory-trials'), { recursive: true });
    await writeFile(path.join(kingdom, '.state', 'territory-trials', 'demo.json'), '{"version":1}');
    expect(await trialLines()).toEqual([
      '! The last trial of territory demo cannot be read (.state/territory-trials/demo.json); run elvaria territory check demo again.',
    ]);
  });
});

describe('elvaria doctor in a folder whose path says "trial", as a trial plot of Elvaria itself', () => {
  let dir: TempDir;
  afterEach(() => dir.remove());

  it('reads the trial lines of the territory, not every line that names the folder', async () => {
    dir = await tempDir();
    const plot = path.join(dir.root, '.elvaria', 'worktrees', 'trial-elvaria');
    await mkdir(plot, { recursive: true });
    const kingdom = await foundKingdom(plot);
    await attachDemo(plot, kingdom);
    expect(await trialLinesOf(kingdom)).toEqual([
      '! Territory demo was never tried: run elvaria territory check demo before its first quest.',
    ]);
  });
});
