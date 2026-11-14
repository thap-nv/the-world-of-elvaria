// `doctor` and the last trial of each territory (PS-25): never tried, failed, tried on other commands, or passed;
// each a warning or a ✓, never an error.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { baseEnv, foundKingdom, isolatedPath, printed, run, tempDir, testIo } from '../../test/cli.ts';
import { FULL, attachDemo, fillDemo, gazetteerAt, patientIo, writeGazetteer } from '../../test/trial.ts';
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
  let head: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    ({ head } = await attachDemo(dir.root, kingdom));
  });
  afterEach(() => dir.remove());

  const trialLines = () => trialLinesOf(kingdom);
  const tryDemo = () => run(patientIo(), 'territory', 'check', 'demo', '--kingdom', kingdom);

  it('reminds of a territory never tried', async () => {
    expect(await trialLines()).toEqual([
      '! Territory demo was never tried: run elvaria territory check demo before its first quest.',
    ]);
  });

  /** The territory's line of a doctor run with the lines indented under it. */
  async function territoryBlock(): Promise<string[]> {
    const io = testIo({ env: baseEnv(await isolatedPath()) });
    await run(io, 'doctor', '--kingdom', kingdom, '--locale', 'en');
    const lines = printed(io).split('\n');
    const at = lines.findIndex((line) => line.includes('Territory demo: passed its trial'));
    const after = lines.slice(at + 1);
    const end = after.findIndex((line) => !line.startsWith('    '));
    return [lines[at] ?? '', ...after.slice(0, end === -1 ? after.length : end)];
  }
  /** A trial of demo that passed at 09:00 with these statuses of its own items, written as `territory check` does. */
  async function writeRecord(checkTime: string): Promise<void> {
    const items = {
      trial: 'pass',
      check_time: checkTime,
      set_aside: 'fail',
      gazetteer: 'fail',
      paths: 'fail',
    };
    const record = {
      version: 1,
      territory: 'demo',
      tried_at: '2026-11-06T09:00:00+07:00',
      base: '0123456789ab',
      items: { ...items, first_pass: 'fail' },
      commands: ['commands.setup: node setup.mjs', 'checks.unit.run: node unit.mjs'],
    };
    await mkdir(path.join(kingdom, '.state', 'territory-trials'), { recursive: true });
    await writeFile(path.join(kingdom, '.state', 'territory-trials', 'demo.json'), JSON.stringify(record));
  }
  const NOW_ALL_PASS =
    '    Read now: — Runs of checks set aside for their environment, ✓ Gazetteer, ✓ shared_paths and protected_paths, — First pass';

  it('says when the trial passed, with the other items that do not and why, read now', async () => {
    await fillDemo(kingdom, FULL);
    await tryDemo();
    const [line = '', ...details] = await territoryBlock();
    // No gazetteer: that item fails; the ledger is empty, so its two rates are not measured.
    expect(line).toMatch(
      /^✓ Territory demo: passed its trial at 2026-11-06 \d\d:\d\d; 1 other items of its scorecard do not pass\.$/,
    );
    expect(details).toEqual([
      "    From that trial: ✓ Each check's time",
      '    Read now: — Runs of checks set aside for their environment, ✗ Gazetteer, ✓ shared_paths and protected_paths, — First pass',
      '    ✗ Gazetteer:',
      '      No gazetteer (territories/<id>/gazetteer.md), or it is empty.',
    ]);
  });

  it('sees a gazetteer and the lists fixed after the trial at once, and lists dropped since, without a new trial', async () => {
    await fillDemo(kingdom, FULL);
    await tryDemo();
    await writeGazetteer(kingdom, gazetteerAt(head));
    const fixed = await territoryBlock();
    expect(fixed[0]).toMatch(/^✓ Territory demo: passed its trial at 2026-11-06 \d\d:\d\d\.$/);
    expect(fixed.slice(1)).toEqual(["    From that trial: ✓ Each check's time", NOW_ALL_PASS]);
    const { shared_paths: _dropped, ...withoutShared } = FULL;
    await fillDemo(kingdom, { ...withoutShared, shared_paths: undefined });
    const dropped = await territoryBlock();
    expect(dropped[0]).toMatch(/; 1 other items of its scorecard do not pass\.$/);
    expect(dropped.slice(3)).toEqual([
      '    ✗ shared_paths and protected_paths:',
      '      shared_paths not declared; with no hot files, declare an empty list.',
      '      laws.protected_paths declared (1 entries).',
    ]);
  });

  it('counts the commits since the stamp to the head of the default branch', async () => {
    await fillDemo(kingdom, FULL);
    await writeRecord('pass');
    await writeGazetteer(kingdom, gazetteerAt('deadbeefdeadbeef'));
    expect((await territoryBlock()).slice(3)).toEqual([
      '    ✗ Gazetteer:',
      "      git does not know the commit deadbeefdead of the gazetteer's stamp.",
      "      The gazetteer names all 2 of the territory's commands.",
    ]);
  });

  it('says when no item failed: the trial items from its record, the others read now whatever it saw', async () => {
    await fillDemo(kingdom, FULL);
    await writeGazetteer(kingdom, gazetteerAt(head));
    await writeRecord('pass');
    expect(await territoryBlock()).toEqual([
      '✓ Territory demo: passed its trial at 2026-11-06 09:00.',
      "    From that trial: ✓ Each check's time",
      NOW_ALL_PASS,
    ]);
  });

  it('sends the owner to a new trial for why an item of the trial fails', async () => {
    await fillDemo(kingdom, FULL);
    await writeGazetteer(kingdom, gazetteerAt(head));
    await writeRecord('fail');
    expect(await territoryBlock()).toEqual([
      '✓ Territory demo: passed its trial at 2026-11-06 09:00; 1 other items of its scorecard do not pass.',
      "    From that trial: ✗ Each check's time",
      NOW_ALL_PASS,
      '    Why an item of the trial fails: elvaria territory check demo (it tries the territory again).',
    ]);
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
