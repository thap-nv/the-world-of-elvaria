// The checks of `elvaria run` with a quest's secrets (P1-10b, implementation-plan §3.9): the Steward hands
// `Plots.check` the treasury values, runChecks puts them in each check's env and masks them in its log. The plot's
// `commands.setup` gets them the same way, through `Plots.prepare` and PlotManager (P1-30).
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { TerritorySchema } from '@elvaria/domain';
import type { PlotManager } from '@elvaria/runner-core';
import { describe, expect, it } from 'vitest';

import { RM_TEMP, testIo } from '../../test/cli.ts';
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
        head: unused,
        touched: () => Promise.resolve(['notes/today.md']),
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
      await rm(dir, RM_TEMP);
    }
  });
});

describe("plots' prepare with a quest's secrets", () => {
  it('hands them to PlotManager.prepare for commands.setup, and none when the quest asks for none (P1-30)', async () => {
    const quest = questFixture('open');
    const asked: unknown[][] = [];
    const plot = { type: 'folder' as const, path: `quests/${quest.id}/work` };
    const manager: PlotManager = {
      prepare: (...args) => {
        asked.push(args.slice(2));
        return Promise.resolve({ ok: true, value: { plot, created: true, setup: null } });
      },
      status: unused,
      head: unused,
      touched: unused,
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
    };
    const territory = TerritorySchema.parse({
      version: 1,
      id: 'notes',
      name: 'notes',
      path: 'D:/notes',
      kind: 'docs',
      vcs: { type: 'none' },
    });
    const plots = plotsOver('D:/kingdom', manager, processHostOf(testIo()));

    await plots.prepare(quest, territory, { secrets: { npm_token: 'value' } });
    await plots.prepare(quest, territory);

    expect(asked).toEqual([[{ secrets: { npm_token: 'value' } }], [undefined]]);
  });

  it("makes the run's next scratch plot with the quest's secrets, and throws when it is not ready (P1-42)", async () => {
    const quest = questFixture('open');
    const asked: unknown[] = [];
    let setupFails = false;
    const manager: PlotManager = {
      prepare: unused,
      status: unused,
      head: unused,
      touched: unused,
      commitAll: unused,
      restore: unused,
      applyPatch: unused,
      diff: unused,
      merge: unused,
      unmerged: unused,
      release: unused,
      prepareScratch: (_quest, _territory, given) => {
        asked.push(given);
        if (setupFails)
          return Promise.resolve({ ok: false, error: { reason: 'setup_failed', detail: 'exit 1' } });
        const plot = { type: 'worktree' as const, path: 'D:/repo/.elvaria/worktrees/q-verify' };
        return Promise.resolve({
          ok: true,
          value: { plot, worktree: 'D:\\repo', base: 'b45e', head: 'f00d' },
        });
      },
      checkoutScratch: unused,
      releaseScratch: unused,
      scratchOf: unused,
    };
    const territory = TerritorySchema.parse({
      version: 1,
      id: 'notes',
      name: 'notes',
      path: 'D:/notes',
      kind: 'docs',
      vcs: { type: 'git', default_branch: 'main' },
    });
    const plots = plotsOver('D:/kingdom', manager, processHostOf(testIo()));
    await plots.prepareScratch(quest, territory, { secrets: { npm_token: 'value' } });
    await plots.prepareScratch(quest, territory);
    expect(asked).toEqual([{ secrets: { npm_token: 'value' } }, {}]);
    setupFails = true;
    await expect(plots.prepareScratch(quest, territory)).rejects.toThrow(
      `the scratch plot of ${quest.id} is not ready (setup_failed): exit 1`,
    );
    // Made again, the plot gets the territory's commands.reset once, its log beside the setup's (P1-47).
    setupFails = false;
    const dir = await mkdtemp(path.join(os.tmpdir(), 'elvaria scratch reset '));
    try {
      const resetting = TerritorySchema.parse({ ...territory, commands: { reset: 'elvaria-no-such-reset' } });
      const reset = plotsOver(dir, manager, processHostOf(testIo())).prepareScratch(quest, resetting);
      const log = `.runs/${quest.id}-verify-reset.log`;
      await expect(reset).rejects.toThrow(
        `commands.reset of ${quest.id}'s scratch plot ended with no exit code (${log})`,
      );
      expect(await readFile(path.join(dir, log), 'utf8')).toContain('elvaria: cannot run this command');
    } finally {
      await rm(dir, RM_TEMP);
    }
  });
});

describe("plots of a party's quests (P1-18)", () => {
  it('runs every check for a merge quest, and hands merging and its check to PlotManager', async () => {
    const quest = questFixture('open');
    const dir = await mkdtemp(path.join(os.tmpdir(), 'elvaria party plots-'));
    try {
      const folder = { type: 'folder' as const, path: `quests/${quest.id}/work` };
      await mkdir(path.join(dir, 'quests', quest.id, 'work'), { recursive: true });
      const asked: string[] = [];
      const manager: PlotManager = {
        prepare: unused,
        status: unused,
        head: unused,
        touched: () => Promise.resolve(['README.md']),
        commitAll: unused,
        restore: unused,
        applyPatch: unused,
        diff: unused,
        merge: (_plot, branches) => {
          asked.push(`merge ${branches.join(',')}`);
          return Promise.resolve({ merged: [...branches], pending: [] });
        },
        unmerged: (_plot, branches) => {
          asked.push(`unmerged ${branches.join(',')}`);
          return Promise.resolve([]);
        },
        release: unused,
        prepareScratch: unused,
        checkoutScratch: unused,
        releaseScratch: unused,
        scratchOf: unused,
      };
      const territory = TerritorySchema.parse({
        version: 1,
        id: 'notes',
        name: 'notes',
        path: 'D:/notes',
        kind: 'docs',
        vcs: { type: 'none' },
        checks: [{ id: 'e2e', run: 'node --version', when: ['apps/**'], timeout_minutes: 1 }],
      });
      const plots = plotsOver(dir, manager, processHostOf(testIo()));
      const runDir = `.runs/${quest.id}-1`;
      expect(await plots.check({ plot: folder, territory, run_dir: runDir })).toEqual([]);
      const all = await plots.check({ plot: folder, territory, run_dir: runDir, party_role: 'merge' });
      expect(all).toMatchObject([{ id: 'e2e', pass: true }]);
      expect(await plots.merge(folder, ['quest/a'])).toEqual({ merged: ['quest/a'], pending: [] });
      expect(await plots.unmerged(folder, ['quest/a'])).toEqual([]);
      expect(asked).toEqual(['merge quest/a', 'unmerged quest/a']);
    } finally {
      await rm(dir, RM_TEMP);
    }
  });
});
