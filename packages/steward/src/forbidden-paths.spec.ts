// A session that left a path of laws.forbidden_paths changed in its plot (P1-49, (b) of P1-46): only a program its
// shell ran could write there, which the fence does not see (agy 1.5.4: `node write-secret.mjs`, spike Antigravity
// §15). The Steward reads the plot's changes before each commit and commits none of them then: a submit goes to the
// infirmary with trip forbidden_paths and the bell, a WIP stays in the plot. Real git repos and PlotManager;
// FakeRunners whose assignee leaves the files in its plot as such a program would.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { isEventOf } from '@elvaria/domain';
import { openJournal } from '@elvaria/eventlog';
import { fromPortable } from '@elvaria/store';
import { afterEach, describe, expect, it } from 'vitest';

import { leavingRunners } from './__fixtures__/deliver.ts';
import { git, gitPlots, gitRepoWith, onRepo } from './__fixtures__/git-plots.ts';
import { RM_TEMP, bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { plotsWith, statusIs } from './__fixtures__/review.ts';
import type { Leaves } from './__fixtures__/deliver.ts';
import type { Bench, BenchOptions } from './__fixtures__/kingdom.ts';
import type { Plots, Steward } from './types.ts';
import type { Quest } from '@elvaria/domain';

let current: Bench | undefined;
let running: Steward | undefined;
const folders: string[] = [];

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  await Promise.all(folders.splice(0).map((made) => rm(made, RM_TEMP)));
  running = undefined;
  current = undefined;
});

const LAWS = { forbidden_paths: ['infra/secrets/**'] };
const WORK = { 'src/app.ts': 'export const app = 2;\n' };

/** dc1-se-team on a git repo that forbids `infra/secrets/**`, its assignee leaving `leaves` in the plot. */
async function open(leaves: Leaves, options: BenchOptions = {}) {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'elvaria forbidden repo '));
  folders.push(repo);
  await gitRepoWith(repo, { 'src/app.ts': 'export const app = 1;\n' });
  current = await bench(options);
  await onRepo(current, repo, [], { laws: LAWS });
  running = current.steward({ plots: gitPlots(current.root), runners: leavingRunners(current, leaves) });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running, repo };
}

/** Commits on the quest's branch since main: the Steward's submit or WIP, none when it committed nothing. */
const commitsOf = (repo: string, quest: Quest): string =>
  git(repo, 'rev-list', '--count', `main..quest/${quest.id}`);

describe('a forbidden path changed in the plot (P1-49)', () => {
  it('sends a finished session to the infirmary, commits nothing, and rings the bell', async () => {
    const secret = { ...WORK, 'infra/secrets/key.txt': 'written by a script\n' };
    const { kingdom, steward, repo } = await open(() => secret);
    await kingdom.command('create_quest', questPayload('Script wrote a key'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Script wrote a key', 'infirmary'));

    const quest = await kingdom.quest('Script wrote a key');
    expect(commitsOf(repo, quest)).toBe('0');
    // The work stays in the plot as the session left it, for the owner to look at.
    const status = git(fromPortable(quest.plot.path ?? ''), 'status', '--porcelain');
    expect(status).toContain('src/app.ts');
    expect(status).toContain('infra/');
    const { events } = await openJournal(kingdom.root, quest.id).read();
    const line = events.findLast((event) => isEventOf(event, 'quest.infirmary'));
    expect(line?.data).toMatchObject({
      trip: 'forbidden_paths',
      detail: { paths: ['infra/secrets/key.txt'] },
    });
    expect(line && isEventOf(line, 'quest.infirmary') ? line.data.reason : '').toMatch(
      /^breaker:forbidden_paths: infra\/secrets\/key\.txt changed in the plot, .*nothing was committed: .*tools\.allow/,
    );
    expect(kingdom.notices).toContainEqual(
      expect.objectContaining({ kind: 'infirmary', trip: 'forbidden_paths' }),
    );
    expect(quest.attempt_log.map(({ role, outcome }) => [role, outcome])).toEqual([['assignee', 'breaker']]);
  });

  it('counts a forbidden file a dotenv glob names at any depth, as the hook does', async () => {
    const { kingdom, steward, repo } = await open(() => ({ ...WORK, 'apps/api/.env': 'TOKEN=x\n' }));
    await kingdom.command('create_quest', questPayload('Dotenv deep down'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Dotenv deep down', 'infirmary'));
    const quest = await kingdom.quest('Dotenv deep down');
    expect(commitsOf(repo, quest)).toBe('0');
    const { events } = await openJournal(kingdom.root, quest.id).read();
    expect(events.findLast((event) => isEventOf(event, 'quest.infirmary'))?.data).toMatchObject({
      detail: { paths: ['apps/api/.env'] },
    });
  });

  it('submits as before when the plot changed no forbidden path', async () => {
    const { kingdom, steward, repo } = await open(() => WORK);
    await kingdom.command('create_quest', questPayload('Clean work'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Clean work', 'done'));
    expect(commitsOf(repo, await kingdom.quest('Clean work'))).toBe('1');
  });

  it('leaves the work of a session paused for mana uncommitted, and says why', async () => {
    const secret = { ...WORK, 'infra/secrets/key.txt': 'written by a script\n' };
    const plays = { work: { 'Paused with a key': ['rate_limit' as const] } };
    const { kingdom, steward, repo } = await open(() => secret, { plays });
    await kingdom.command('create_quest', questPayload('Paused with a key'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Paused with a key', 'paused_mana'));
    expect(commitsOf(repo, await kingdom.quest('Paused with a key'))).toBe('0');
    expect(kingdom.warnings.join('\n')).toMatch(
      /WIP not committed, it stays in the plot: laws\.forbidden_paths changed .*infra\/secrets\/key\.txt/,
    );
  });
});

describe('a plot whose changes cannot be listed (P1-49)', () => {
  it('is not committed: the fence cannot be checked, so the quest goes to the infirmary as a refused commit', async () => {
    current = await bench();
    const calls: string[] = [];
    const broken: Partial<Plots> = { touched: () => Promise.reject(new Error('git status failed')) };
    running = current.steward({ plots: plotsWith(current.root, broken, calls) });
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    await current.command('create_quest', questPayload('Unlisted'));
    await tickUntil(running, current.clock, statusIs(current, 'Unlisted', 'infirmary'));
    expect(calls.filter((call) => call.startsWith('commit'))).toEqual([]);
    const quest = await current.quest('Unlisted');
    const { events } = await openJournal(current.root, quest.id).read();
    expect(events.findLast((event) => isEventOf(event, 'quest.infirmary'))?.data).toMatchObject({
      trip: 'commit',
      detail: { message: 'git status failed' },
    });
  });
});
