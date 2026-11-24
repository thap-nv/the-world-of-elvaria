// fix/plot-setup-on-lockfile: commands.setup runs again in a quest's plot once a file of commands.setup_when differs
// from what its last success read, before the Steward commits (refreshSetup) and at the next prepare. Real git: the
// files setup reads are what `git ls-files` lists, ignored ones aside.
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { fromPortable } from '@elvaria/store';
import type { Plot, QuestId } from '@elvaria/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { TEST_HOST, commitFile, gitRepo, questId, territoryAt } from '../__fixtures__/git-repo.ts';
import { createPlotManager } from './plot-manager.ts';
import { setupLogOf } from './setup.ts';

let root = '';
let kingdom = '';
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria setup when '));
  kingdom = path.join(root, 'my kingdom');
  await mkdir(kingdom);
});
afterAll(() => rm(root, RM_TEMP));

const SETUP = [
  "import { appendFileSync, existsSync } from 'node:fs';",
  "if (existsSync('fail-setup')) process.exit(3);",
  "appendFileSync('setup-ran.txt', 'x');",
  '',
].join('\n');
const WHEN = ['pnpm-lock.yaml', '**/package.json'];

/** A repo whose setup counts its runs in setup-ran.txt, and fails while `fail-setup` exists; the quest's plot in it. */
async function plotIn(folder: string, suffix: string, setupWhen?: readonly string[]) {
  const repo = await gitRepo(path.join(root, folder));
  await commitFile(repo, 'setup.mjs', SETUP);
  await commitFile(repo, 'package.json', '{ "name": "demo" }\n');
  await commitFile(repo, '.gitignore', 'node_modules/\nsetup-ran.txt\nfail-setup\n');
  const commands = { setup: 'node setup.mjs', ...(setupWhen === undefined ? {} : { setup_when: setupWhen }) };
  const territory = territoryAt(repo, { commands });
  const plots = createPlotManager({ kingdom, host: TEST_HOST });
  const id = questId(suffix);
  const prepared = await plots.prepare({ id }, territory);
  if (!prepared.ok) throw new Error(`prepare failed: ${prepared.error.detail}`);
  const quest: { id: QuestId; plot: Plot } = { id, plot: prepared.value.plot };
  const worktree = fromPortable(prepared.value.plot.path!);
  return {
    plots,
    territory,
    quest,
    worktree,
    runs: () => readFile(path.join(worktree, 'setup-ran.txt'), 'utf8'),
    write: async (file: string, text: string) => {
      await mkdir(path.dirname(path.join(worktree, file)), { recursive: true });
      await writeFile(path.join(worktree, file), text);
    },
    refresh: () => plots.refreshSetup(quest, territory),
  };
}

describe('commands.setup_when', () => {
  it('runs setup again once a file it names changed, committed or not, and never for another file', async () => {
    const plot = await plotIn('lockfile', 'sw0001', WHEN);
    expect(await plot.runs()).toBe('x');
    expect(await plot.refresh()).toEqual({ ok: true, value: null });

    await plot.write('src/a.ts', 'export {};\n');
    await plot.write('node_modules/left-pad/package.json', '{ "name": "left-pad" }\n');
    expect(await plot.refresh()).toEqual({ ok: true, value: null });

    await plot.write('packages/b/package.json', '{ "name": "b" }\n');
    expect(await plot.refresh()).toMatchObject({
      ok: true,
      value: { exit_code: 0, log_path: setupLogOf(plot.quest.id) },
    });
    expect(await plot.runs()).toBe('xx');
    expect(await plot.refresh()).toEqual({ ok: true, value: null });

    // The same files committed: nothing setup reads changed.
    expect(await plot.plots.commitAll(plot.quest.plot, 'chore: work')).toMatchObject({ status: 'committed' });
    expect(await plot.refresh()).toEqual({ ok: true, value: null });

    // The next prepare compares as well; a deleted file counts.
    await plot.write('pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
    expect(await plot.plots.prepare(plot.quest, plot.territory)).toMatchObject({
      ok: true,
      value: { setup: { exit_code: 0 } },
    });
    await rm(path.join(plot.worktree, 'packages', 'b', 'package.json'));
    expect(await plot.refresh()).toMatchObject({ ok: true, value: { exit_code: 0 } });
    expect(await plot.runs()).toBe('xxxx');
  });

  it('runs setup once more for a plot set up before setup_when was written, and never again without it', async () => {
    const plot = await plotIn('before when', 'sw0002');
    await plot.write('package.json', '{ "name": "demo", "dependencies": { "b": "1" } }\n');
    expect(await plot.refresh()).toEqual({ ok: true, value: null });
    expect(await plot.runs()).toBe('x');

    const watched = territoryAt(fromPortable(plot.territory.path), {
      commands: { setup: 'node setup.mjs', setup_when: WHEN },
    });
    expect(await plot.plots.refreshSetup(plot.quest, watched)).toMatchObject({
      ok: true,
      value: { exit_code: 0 },
    });
    expect(await plot.plots.refreshSetup(plot.quest, watched)).toEqual({ ok: true, value: null });
    expect(await plot.runs()).toBe('xx');
  });

  it('reports a setup that fails and runs it again until it succeeds; a plot without git has none', async () => {
    const plot = await plotIn('failing again', 'sw0003', WHEN);
    await plot.write('pnpm-lock.yaml', 'lockfileVersion: 9.0\n');
    await plot.write('fail-setup', '');

    const failed = await plot.refresh();
    expect(failed).toEqual({
      ok: false,
      error: {
        reason: 'setup_failed',
        detail: 'node setup.mjs: ended with 3',
        log_path: setupLogOf(plot.quest.id),
      },
    });
    await rm(path.join(plot.worktree, 'fail-setup'));
    expect(await plot.refresh()).toMatchObject({ ok: true, value: { exit_code: 0 } });
    expect(await plot.runs()).toBe('xx');

    const folder: Plot = { type: 'folder', path: 'quests/q_20261107_folder/work' };
    expect(await plot.plots.refreshSetup({ id: plot.quest.id, plot: folder }, plot.territory)).toEqual({
      ok: true,
      value: null,
    });
  });
});
