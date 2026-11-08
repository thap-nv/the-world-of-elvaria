// The checks of `elvaria run` with a quest's secrets (P1-10b, implementation-plan §3.9): the Steward hands
// `Plots.check` the treasury values, runChecks puts them in each check's env and masks them in its log.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { TerritorySchema } from '@elvaria/domain';
import type { PlotManager } from '@elvaria/runner-core';
import { describe, expect, it } from 'vitest';

import { testIo } from '../../test/cli.ts';
import { questFixture } from '../../test/quest.ts';
import { plotsOver, processHostOf } from './plots.ts';

const unused = () => Promise.reject(new Error('unused'));

describe("plots' checks with a quest's secrets", () => {
  it('gives each check the secrets and masks their values in its log (P1-10b)', async () => {
    const quest = questFixture('open');
    const dir = await mkdtemp(path.join(os.tmpdir(), 'elvaria plots-'));
    try {
      const folder = { type: 'folder' as const, path: `quests/${quest.id}/work` };
      const work = path.join(dir, 'quests', quest.id, 'work');
      await mkdir(work, { recursive: true });
      // A login to a private registry: it needs the token, and prints it.
      await writeFile(
        path.join(work, 'login.mjs'),
        'if (!process.env.NPM_TOKEN) process.exit(1);\nconsole.log(`login ${process.env.NPM_TOKEN}`);\n',
      );
      const manager: PlotManager = {
        prepare: unused,
        status: unused,
        touched: () => Promise.resolve(['notes/today.md']),
        commitAll: unused,
        diff: unused,
        release: unused,
      };
      const territory = TerritorySchema.parse({
        version: 1,
        id: 'notes',
        name: 'notes',
        path: 'D:/notes',
        kind: 'docs',
        vcs: { type: 'none' },
        checks: [{ id: 'login', run: 'node login.mjs', when: ['**'], timeout_minutes: 1 }],
      });
      const plots = plotsOver(dir, manager, processHostOf(testIo()));
      const value = ['plain', '-FAKE-', 'registry-41'].join('');
      const runs = await plots.check({
        plot: folder,
        territory,
        run_dir: `.runs/${quest.id}-1`,
        secrets: { npm_token: value },
      });
      expect(runs).toMatchObject([{ id: 'login', pass: true }]);
      const log = await readFile(path.join(dir, '.runs', `${quest.id}-1`, 'checks', 'login.log'), 'utf8');
      expect(log).toContain('login [redacted]');
      expect(log).not.toContain(value);
      // Without them, the same check fails: the host's minimal env has no token.
      const bare = await plots.check({ plot: folder, territory, run_dir: `.runs/${quest.id}-2` });
      expect(bare).toMatchObject([{ id: 'login', pass: false }]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
