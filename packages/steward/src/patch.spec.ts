// The Steward applies an assignee's patch for laws.patch_paths before the submit commit (P1-28, phase 1 report
// §5.9): real git repos and PlotManager, FakeRunners whose assignee leaves the patch in its plot. Then (P1-31) the
// delivery note names what it changed, and the run after a refused one reads why.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { reduce } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { PATCH_FILE } from '@elvaria/runner-core';
import { fromPortable, pathExists } from '@elvaria/store';
import { afterEach, describe, expect, it } from 'vitest';

import { delivered, leavingRunners, noteOf } from './__fixtures__/deliver.ts';
import { git, gitPlots, gitRepoWith, onRepo } from './__fixtures__/git-plots.ts';
import { bench, questPayload, tickUntil, worldOfFiles } from './__fixtures__/kingdom.ts';
import { APPRENTICE_LEFT } from './sessions/breaker.ts';
import { patchRefusal, refusedPatchOf } from './sessions/patch.ts';
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

describe('after the patch (P1-31)', () => {
  const SECTION = '## Applied through a patch';

  it('the delivery note names the paths the Steward applied from it', async () => {
    const { kingdom, steward } = await open(PATCH);
    await kingdom.command('create_quest', questPayload('Lint before push'));
    await tickUntil(steward, kingdom.clock, delivered(kingdom, 'Lint before push'));
    const note = await noteOf(kingdom, await kingdom.quest('Lint before push'));
    const section = note.slice(note.indexOf(SECTION)).split('\n## ')[0] ?? '';
    expect(section).toContain('the Steward applied it before the commit');
    // Exactly the one path the patch changed, and nothing the character wrote with its own tools.
    expect(section.trimEnd().endsWith('before you merge:\n\n- `.husky/pre-push`')).toBe(true);
  });

  it('the delivery note of a quest without a patch has no such section', async () => {
    const { kingdom, steward } = await open(undefined);
    await kingdom.command('create_quest', questPayload('Lint before push'));
    await tickUntil(steward, kingdom.clock, delivered(kingdom, 'Lint before push'));
    const note = await noteOf(kingdom, await kingdom.quest('Lint before push'));
    expect(note).toContain('## Merge by hand');
    expect(note).not.toContain(SECTION);
  });

  it('refused at run n, it is named with why in the prompt of run n + 1, and only there', async () => {
    const { kingdom, steward } = await open(PATCH.replace(' pnpm test', ' pnpm build'));
    await kingdom.command('create_quest', questPayload('Lint before push'));
    await tickUntil(steward, kingdom.clock, moved(kingdom, 'Lint before push'));
    const sick = await kingdom.quest('Lint before push');
    expect(sick.status).toBe('infirmary');
    await kingdom.command('retry', { quest: sick.id });
    const assignees = () => kingdom.requests.filter(({ role }) => role === 'assignee');
    await tickUntil(steward, kingdom.clock, () => Promise.resolve(assignees().length === 2));
    const [first, second] = assignees().map(({ prompt }) => prompt.user);
    expect(second).toContain('# Picking up the quest');
    expect(second).toContain('## The patch that was not applied');
    expect(second).toContain('```text\nit does not apply: error: patch failed: .husky/pre-push:1');
    expect(first).not.toContain('The patch that was not applied');
  });
});

describe('refusedPatchOf (P1-31)', () => {
  it("reads why from a refused patch's infirmary reason, without the note for the owner", () => {
    const why = 'it touches src/app.ts, outside laws.patch_paths (.husky/**)';
    expect(refusedPatchOf(`breaker:commit: ${patchRefusal(why)}`)).toBe(why);
    expect(refusedPatchOf(`breaker:commit: ${patchRefusal(why)}${APPRENTICE_LEFT}`)).toBe(why);
  });

  it.each([
    'breaker:commit: husky - pre-commit script failed',
    `breaker:time: ${patchRefusal('it does not apply')}`,
    'max_attempts',
  ])('is undefined for any other reason: %s', (reason) => {
    expect(refusedPatchOf(reason)).toBeUndefined();
  });
});
