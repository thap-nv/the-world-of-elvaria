// `elvaria territory check` (PS-25) on a real git repo whose path has spaces: the trial, the card, the exit code, and
// nothing left in the repo but what was there.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { SCORECARD_ITEMS, SCORECARD_REASONS } from '@elvaria/domain';
import { isMessageKey } from '@elvaria/i18n';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { foundKingdom, git, printed, run, tempDir, testIo } from '../../test/cli.ts';
import {
  FULL,
  attachDemo,
  fillDemo,
  gazetteerAt,
  patientIo,
  seedLedger,
  writeGazetteer,
} from '../../test/trial.ts';
import { itemKeyOf, reasonKeyOf } from './check-view.ts';
import { readTrialRecord } from './trial-record.ts';
import type { TempDir, TestIo } from '../../test/cli.ts';

describe('elvaria territory check', () => {
  let dir: TempDir;
  let kingdom: string;
  let repo: string;
  let head: string;
  beforeEach(async () => {
    dir = await tempDir();
    kingdom = await foundKingdom(dir.root);
    ({ repo, head } = await attachDemo(dir.root, kingdom));
  });
  afterEach(() => dir.remove());

  const check = (io: TestIo, id = 'demo') =>
    run(io, 'territory', 'check', id, '--kingdom', kingdom, '--locale', 'en');
  const outLines = (io: TestIo) => io.printed.out;

  it('passes every item of a territory that has all it needs, and leaves no plot and no branch', async () => {
    await fillDemo(kingdom, FULL);
    await writeGazetteer(kingdom, gazetteerAt(head));
    await seedLedger(kingdom);
    const io = patientIo();
    expect(await check(io)).toBe(0);
    const lines = outLines(io);
    expect(lines).toContain(`Scorecard of territory demo, tried on main (${head.slice(0, 12)}):`);
    expect(lines.filter((line) => /^[✓✗—] /.test(line))).toEqual([
      '✓ Trial: setup and every check on a clean plot of the default branch',
      "✓ Each check's time",
      '✓ Runs of checks set aside for their environment',
      '✓ Gazetteer',
      '✓ shared_paths and protected_paths',
      '✓ First pass',
    ]);
    expect(lines).toContain('    3/3 quests passed their first run (100 %, at least 50 %).');
    expect(lines.at(-1)).toBe('Ready: no item fails.');
    expect(existsSync(path.join(repo, '.elvaria', 'worktrees', 'trial-demo'))).toBe(false);
    expect(git(repo, 'worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1);
    expect(git(repo, 'branch', '--list', '--format=%(refname:short)')).toBe('main');
    const record = await readTrialRecord(kingdom, 'demo');
    expect(record).toMatchObject({
      kind: 'read',
      record: { base: head.slice(0, 12), items: { trial: 'pass' } },
    });
  });

  it('fails the trial on a broken setup, naming its command and first error line, and exits 1', async () => {
    await fillDemo(kingdom, { ...FULL, commands: { setup: 'node broken-setup.mjs' } });
    const io = patientIo();
    expect(await check(io)).toBe(1);
    expect(printed(io)).toContain(
      'commands.setup failed: node broken-setup.mjs (exit code 3). First error line: boom: cannot install Log: .runs/trial-demo-setup.log',
    );
    expect(outLines(io).at(-1)).toBe(
      'Not ready: the trial fails. Fix it, then run elvaria territory check demo again.',
    );
    expect(existsSync(path.join(repo, '.elvaria', 'worktrees', 'trial-demo'))).toBe(false);
  });

  it('names the check that is red on the default branch', async () => {
    await fillDemo(kingdom, {
      ...FULL,
      checks: [...FULL.checks, { id: 'lint', run: 'node red.mjs', when: ['**'], timeout_minutes: 5 }],
    });
    const io = patientIo();
    expect(await check(io)).toBe(1);
    expect(printed(io)).toContain(
      'Check lint fails on the default branch: node red.mjs (exit code 1). First error line: Error: expected 1 to be 2',
    );
  });

  it('fails the gazetteer item when the gazetteer names none of the commands, and still exits 0', async () => {
    await fillDemo(kingdom, FULL);
    await writeGazetteer(kingdom, `<!-- elvaria:commit ${head} -->\nA demo repo.\n`);
    const io = patientIo();
    expect(await check(io)).toBe(0);
    const lines = outLines(io);
    expect(lines).toContain('✗ Gazetteer');
    expect(lines).toContain('    The gazetteer does not name checks.unit.run: node unit.mjs');
    expect(lines).toContain('    The gazetteer was written at ' + head.slice(0, 12) + ', 0 commits ago.');
    expect(lines.at(-1)).toMatch(/^Ready: the trial passes; 1 other items do not/);
  });

  it('keeps no result of a trial the owner stopped', async () => {
    await fillDemo(kingdom, FULL);
    const io = testIo();
    expect(await check(io)).toBe(1);
    expect(printed(io)).toContain('Trial stopped');
    expect(await readTrialRecord(kingdom, 'demo')).toEqual({ kind: 'none' });
  });

  it('refuses a territory it does not know', async () => {
    const io = patientIo();
    expect(await check(io, 'nowhere')).toBe(1);
    expect(printed(io)).toContain('No territory nowhere');
  });

  it('tries nothing on a folder territory, and says so', async () => {
    await fillDemo(kingdom, { vcs: { type: 'none' } });
    const io = patientIo();
    expect(await check(io)).toBe(0);
    expect(outLines(io)[0]).toBe('Scorecard of territory demo (not tried):');
    expect(outLines(io).at(-1)).toContain('has no git, so nothing was tried');
    const record = JSON.parse(
      await readFile(path.join(kingdom, '.state', 'territory-trials', 'demo.json'), 'utf8'),
    ) as { items: Record<string, string> };
    expect(record.items.trial).toBe('unmeasured');
  });
});

describe('the scorecard strings', () => {
  it('has a line for every item and every reason code', () => {
    expect(SCORECARD_ITEMS.map((id) => itemKeyOf({ id })).filter((key) => !isMessageKey(key))).toEqual([]);
    expect(SCORECARD_REASONS.map(reasonKeyOf).filter((key) => !isMessageKey(key))).toEqual([]);
  });
});
