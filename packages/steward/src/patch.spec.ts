// The Steward applies an assignee's patch for laws.patch_paths before the submit commit (P1-28, phase 1 report
// §5.9): real git repos and PlotManager, FakeRunners whose assignee leaves the patch in its plot.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { reduce } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { PATCH_FILE } from '@elvaria/runner-core';
import { fromPortable, pathExists } from '@elvaria/store';
import { afterEach, describe, expect, it } from 'vitest';

import { leavingRunners } from './__fixtures__/deliver.ts';
import { git, gitPlots, gitRepoWith, onRepo } from './__fixtures__/git-plots.ts';
import { bench, questPayload, tickUntil, worldOfFiles } from './__fixtures__/kingdom.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward } from './types.ts';
import type { Quest } from '@elvaria/domain';

let current: Bench | undefined;
let running: Steward | undefined;
const folders: string[] = [];

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  await Promise.all(folders.splice(0).map((made) => rm(made, { recursive: true, force: true })));
  running = undefined;
  current = undefined;
});

const HOOK = 'pnpm test\n';
const PATCH = [
  'diff --git a/.husky/pre-push b/.husky/pre-push',
  '--- a/.husky/pre-push',
  '+++ b/.husky/pre-push',
  '@@ -1 +1,2 @@',
  ' pnpm test',
  '+pnpm lint',
  '',
].join('\n');

/** dc1-se-team on a git repo with a husky hook, its assignee leaving `patch` (if any) as PATCH_FILE. */
async function open(patch: string | undefined, patchPaths: readonly string[] = ['.husky/**']) {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'elvaria patch repo '));
  folders.push(repo);
  await gitRepoWith(repo, { '.husky/pre-push': HOOK, 'src/app.ts': 'export const app = 1;\n' });
  current = await bench();
  await onRepo(current, repo, patchPaths);
  const leaves = () => (patch === undefined ? {} : { [PATCH_FILE]: patch });
  running = current.steward({ plots: gitPlots(current.root), runners: leavingRunners(current, leaves) });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

const worktreeOf = (quest: Quest): string => fromPortable(quest.plot.path ?? '');
const linesOf = async (kingdom: Bench, type: string) =>
  (await openEventLog(kingdom.root).read()).events.filter((event) => event.type === type);
const moved = (kingdom: Bench, title: string) => async () =>
  !['open', 'claimed', 'working'].includes((await kingdom.quest(title)).status);

describe('a patch for the paths the CLI guards (P1-28)', () => {
  it('is applied before the submit commit, which carries the change, and the file is gone', async () => {
    const { kingdom, steward } = await open(PATCH);
    await kingdom.command('create_quest', questPayload('Lint before push'));
    await tickUntil(steward, kingdom.clock, moved(kingdom, 'Lint before push'));
    const quest = await kingdom.quest('Lint before push');
    expect(quest.status).not.toBe('infirmary');
    const worktree = worktreeOf(quest);
    expect(git(worktree, 'log', '-1', '--format=%s')).toBe(`chore: submit ${quest.id}`);
    expect(git(worktree, 'show', '--name-only', '--format=', 'HEAD').split('\n')).toEqual([
      '.husky/pre-push',
    ]);
    expect(await readFile(path.join(worktree, '.husky', 'pre-push'), 'utf8')).toBe('pnpm test\npnpm lint\n');
    expect(await pathExists(path.join(worktree, PATCH_FILE))).toBe(false);
    const [line, ...more] = await linesOf(kingdom, 'plot.patched');
    expect(more).toEqual([]);
    expect(line).toMatchObject({
      quest: quest.id,
      attempt: 1,
      actor: { kind: 'steward' },
      data: { file: PATCH_FILE, paths: ['.husky/pre-push'] },
    });
    const log = await openEventLog(kingdom.root).read();
    expect(reduce(await kingdom.morning(), log.events)).toEqual(await worldOfFiles(kingdom.store));
  });

  it.each([
    [
      'touches a path outside patch_paths',
      PATCH.replaceAll('.husky/pre-push', 'src/app.ts').replace(' pnpm test', ' export const app = 1;'),
      'it touches src/app.ts, outside laws.patch_paths (.husky/**)',
    ],
    [
      "reaches git's own folder",
      `${PATCH}diff --git a/.git/hooks/pre-commit b/.git/hooks/pre-commit\nnew file mode 100755\n--- /dev/null\n+++ b/.git/hooks/pre-commit\n@@ -0,0 +1 @@\n+echo owned\n`,
      "it touches .git/hooks/pre-commit, git's own folder",
    ],
    ['does not apply', PATCH.replace(' pnpm test', ' pnpm build'), 'it does not apply: error: patch failed'],
  ])('that %s is not applied, and the quest goes to the infirmary with why', async (_, patch, why) => {
    const { kingdom, steward } = await open(patch);
    await kingdom.command('create_quest', questPayload('Lint before push'));
    await tickUntil(steward, kingdom.clock, moved(kingdom, 'Lint before push'));
    const quest = await kingdom.quest('Lint before push');
    expect(quest.status).toBe('infirmary');
    expect(quest.attempt_log.at(-1)).toMatchObject({ outcome: 'breaker' });
    const [notice, ...others] = kingdom.notices;
    expect(others).toEqual([]);
    expect(notice?.kind === 'infirmary' ? notice.reason : notice).toContain(
      `breaker:commit: ${PATCH_FILE} was not applied: ${why}`,
    );
    const worktree = worktreeOf(quest);
    // Nothing committed, nothing applied: the patch waits in the plot for the owner.
    expect(git(worktree, 'log', '--format=%s')).toBe('first');
    expect(await readFile(path.join(worktree, '.husky', 'pre-push'), 'utf8')).toBe(HOOK);
    expect(await pathExists(path.join(worktree, PATCH_FILE))).toBe(true);
    expect(await linesOf(kingdom, 'plot.patched')).toEqual([]);
    expect((await kingdom.character('kael')).status).toBe('idle');
  });

  it('is a file like any other on a territory that lists no patch path', async () => {
    const { kingdom, steward } = await open(PATCH, []);
    await kingdom.command('create_quest', questPayload('Lint before push'));
    await tickUntil(steward, kingdom.clock, moved(kingdom, 'Lint before push'));
    const quest = await kingdom.quest('Lint before push');
    const worktree = worktreeOf(quest);
    expect(git(worktree, 'show', '--name-only', '--format=', 'HEAD').split('\n')).toEqual([PATCH_FILE]);
    expect(await readFile(path.join(worktree, '.husky', 'pre-push'), 'utf8')).toBe(HOOK);
    expect(await linesOf(kingdom, 'plot.patched')).toEqual([]);
  });
});
