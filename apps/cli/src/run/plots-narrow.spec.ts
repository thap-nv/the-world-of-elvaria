// The checks of `elvaria run` in a narrow run (CM-01, ADR 0032): the Steward asks `Plots.check` for a narrow run, and
// each check runs its narrow command with the plot's base (PlotManager.checkBase) in ELVARIA_CHECK_BASE.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { TerritorySchema } from '@elvaria/domain';
import type { PlotManager } from '@elvaria/runner-core';
import { tempDir } from '@elvaria/testkit';
import { describe, expect, it } from 'vitest';

import { testIo } from '../__fixtures__/cli.ts';
import { questFixture } from '../__fixtures__/quest.ts';
import { plotsOver, processHostOf } from './plots.ts';

const unused = () => Promise.reject(new Error('unused'));
const BASE = '9c8b7a6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b';

/** A plot manager that knows what the quest touched and, when given, its base; nothing else. */
const managerOf = (checkBase?: PlotManager['checkBase']): PlotManager => ({
  prepare: unused,
  status: unused,
  head: unused,
  touched: () => Promise.resolve(['src/total.ts']),
  ...(checkBase === undefined ? {} : { checkBase }),
  commitAll: unused,
  restore: unused,
  applyPatch: unused,
  diff: unused,
  merge: unused,
  unmerged: unused,
  release: unused,
  prepareScratch: unused,
  checkoutScratch: unused,
  releaseScratch: unused,
  scratchOf: unused,
  update: unused,
  generate: unused,
  settle: unused,
  takeBack: unused,
  mergesClean: unused,
  diffLines: unused,
  refreshSetup: unused,
  stagedTree: unused,
  healDiff: unused,
  restoreTree: unused,
});

describe("plots' checks in a narrow run (CM-01)", () => {
  it('run the narrow command with the base in its env, and in full `run` without it, as before CM-01', async () => {
    const quest = questFixture('open');
    const temp = await tempDir('narrow plots');
    const dir = temp.root;
    try {
      const folder = { type: 'folder' as const, path: `quests/${quest.id}/work` };
      const work = path.join(dir, 'quests', quest.id, 'work');
      await mkdir(work, { recursive: true });
      await writeFile(
        path.join(work, 'probe.mjs'),
        "console.log(`${process.argv[2]} from ${process.env.ELVARIA_CHECK_BASE ?? 'no base'}`);\n",
      );
      const territory = TerritorySchema.parse({
        version: 1,
        id: 'ledger',
        name: 'ledger',
        path: 'D:/ledger',
        kind: 'code',
        vcs: { type: 'none' },
        checks: [
          {
            id: 'unit',
            run: 'node probe.mjs whole',
            narrow: 'node probe.mjs changed',
            when: ['src/**'],
            timeout_minutes: 1,
          },
        ],
      });
      const host = processHostOf(testIo());
      const logOf = (n: number) =>
        readFile(path.join(dir, '.runs', `${quest.id}-${n}`, 'checks', 'unit.log'), 'utf8');
      const narrow = plotsOver(
        dir,
        managerOf(() => Promise.resolve(BASE)),
        host,
      );
      await narrow.check({ plot: folder, territory, run_dir: `.runs/${quest.id}-1`, mode: 'narrow' });
      expect(await logOf(1)).toContain(`changed from ${BASE}`);
      await narrow.check({ plot: folder, territory, run_dir: `.runs/${quest.id}-2` });
      expect(await logOf(2)).toContain('whole from no base');
      // A manager without checkBase (a stand-in) gives a narrow run no base either.
      await plotsOver(dir, managerOf(), host).check({
        plot: folder,
        territory,
        run_dir: `.runs/${quest.id}-3`,
        mode: 'narrow',
      });
      expect(await logOf(3)).toContain('changed from no base');
    } finally {
      await temp.remove();
    }
  });
});
