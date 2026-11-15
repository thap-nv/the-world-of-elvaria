// A party's merge quest takes the territory's base branch in after its parts (implementation-plan §3.13, PS-08e):
// main moved on since the contract forked, and the party meets it before its checks and its judge, not when the owner
// delivers it. A conflict with main goes the way of a conflict between parts: the machine's run stops, the bell rings,
// the knight of the next run concludes it. What main changed on its own is never the party's work: not in the judge's
// diff, not a protected change, not outside the scope.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isEventOf } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { SUBQUESTS_FILE } from '@elvaria/runner-core';
import { fromPortable, pathExists } from '@elvaria/store';
import { afterEach, describe, expect, it } from 'vitest';

import { git } from './__fixtures__/git-plots.ts';
import { tickUntil } from './__fixtures__/kingdom.ts';
import {
  CONTRACT,
  contractPayload,
  list,
  mergeOf,
  part,
  partyBench,
  reached,
  worktreeOf,
} from './__fixtures__/party.ts';
import type { Files, PartyBench } from './__fixtures__/party.ts';
import type { Bench } from './__fixtures__/kingdom.ts';

let current: PartyBench | undefined;

afterEach(async () => {
  await current?.remove();
  current = undefined;
});

const PROTECTED = { territory: { laws: { protected_paths: ['infra/**'] } } };
const MAIN_ONLY = 'docs/main-only.md';
const MAIN_INFRA = 'infra/deploy.yaml';

/** Commits `files` on the territory's main, as the owner merging another PR would; its head. */
async function onMain(repo: string, files: Readonly<Record<string, string>>): Promise<string> {
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(repo, file)), { recursive: true });
    await writeFile(path.join(repo, file), text);
  }
  git(repo, 'add', '--all');
  git(repo, 'commit', '-q', '-m', 'main moves on');
  return git(repo, 'rev-parse', 'HEAD');
}

/** True once the contract's worktree is made: the party forked from main as it was then. */
const contractForked = (kingdom: Bench) => async (): Promise<boolean> =>
  (await kingdom.quests()).some(
    ({ party_role: role, plot }) => role === 'contract' && plot.type === 'worktree',
  );

/** The party of `files`, with main moved on by `moved` once the contract forked; the merge quest at its seal. */
async function partyAfterMain(files: Files, moved: Readonly<Record<string, string>>, seen: string[] = []) {
  current = await partyBench(
    files,
    1,
    {},
    {
      ...PROTECTED,
      // What the checks see: main's own file in the plot means they run on the party merged with main.
      plots: (plots) => ({
        check: async (request) => {
          seen.push(
            ...((await pathExists(path.join(fromPortable(request.plot.path ?? ''), MAIN_ONLY)))
              ? [request.run_dir]
              : []),
          );
          return plots.check(request);
        },
      }),
    },
  );
  const { kingdom, steward, repo } = current;
  await kingdom.command('create_quest', contractPayload('Book a room'));
  await tickUntil(steward, kingdom.clock, contractForked(kingdom), 100);
  const main = await onMain(repo, moved);
  await tickUntil(
    steward,
    kingdom.clock,
    reached(() => mergeOf(kingdom), 'awaiting_seal'),
    300,
  );
  return { kingdom, repo, main, merge: await mergeOf(kingdom) };
}

const runsOf = (merge: Awaited<ReturnType<typeof mergeOf>>) =>
  merge.attempt_log
    .filter(({ role }) => role === 'assignee')
    .map(({ n, character, outcome }) => [n, character, outcome]);

const contract = {
  [CONTRACT]: 'openapi: 3.1.0\n',
  [SUBQUESTS_FILE]: list(part('d1', 'Rooms API'), part('d2', 'Rooms page')),
};

describe('the merge quest takes main in after its parts (PS-08e)', () => {
  it("merges main in the machine's run; the checks run on the result, the judge never reads main's own files", async () => {
    const seen: string[] = [];
    const files = {
      'Book a room': contract,
      'Rooms API': { 'apps/api/rooms.ts': 'export const rooms = [];\n' },
      'Rooms page': { 'apps/web/rooms.ts': 'export const page = 1;\n' },
    };
    const moved = { [MAIN_ONLY]: '# main\n', [MAIN_INFRA]: 'replicas: 2\n' };
    const { kingdom, repo, main, merge } = await partyAfterMain(files, moved, seen);

    // The machine made the run, main in it, and no knight was called.
    expect(runsOf(merge)).toEqual([[1, null, 'submitted']]);
    expect(git(repo, 'rev-list', '--count', `quest/${merge.id}..${main}`)).toBe('0');
    expect(seen).toEqual([`.runs/${merge.id}-1`]);
    const party = await readFile(
      path.join(kingdom.root, '.runs', `${merge.id}-1`, 'checks', 'party.log'),
      'utf8',
    );
    expect(party).toContain('✓ main');
    // main changed a protected path the party did not: the merge quest carries no such mark.
    expect(merge.protected_changes).toBeUndefined();
    const judge = kingdom.requests.find((req) => req.quest?.id === merge.id && req.role === 'verifier');
    expect(judge?.prompt.user).not.toContain(MAIN_ONLY);
    expect(judge?.prompt.user).not.toContain(MAIN_INFRA);
    const lines = (await openEventLog(kingdom.root).read()).events.filter(
      (event) => isEventOf(event, 'plot.merged') && event.quest === merge.id,
    );
    expect(lines.map(({ data }) => data)).toEqual([
      {
        into: `quest/${merge.id}`,
        merged: [...merge.depends_on.map((id) => `quest/${id}`), 'main'],
        pending: [],
      },
    ]);
    expect(kingdom.notices.filter(({ kind }) => kind === 'merge_stopped')).toEqual([]);
  }, 240_000);

  it('stops on a conflict with main: one bell, the knight concludes it in the same quest, main in the branch', async () => {
    const files = {
      'Book a room': contract,
      'Rooms API': { 'README.md': '# dc1 rooms\n' },
      'Rooms page': { 'apps/web/rooms.ts': 'export const page = 1;\n' },
      merge: { 'README.md': '# dc1 rooms, on main\n' },
    };
    const moved = { 'README.md': '# dc1 main\n', [MAIN_INFRA]: 'replicas: 2\n' };
    const { kingdom, repo, main, merge } = await partyAfterMain(files, moved);

    expect(runsOf(merge)).toEqual([
      [1, null, 'cancelled'],
      [2, expect.any(String), 'submitted'],
    ]);
    const rung = kingdom.notices.filter(({ kind }) => kind === 'merge_stopped');
    expect(rung).toEqual([
      {
        kind: 'merge_stopped',
        quest: expect.objectContaining({ id: merge.id }) as unknown,
        branch: 'main',
        reason: 'conflict',
        conflicts: ['README.md'],
      },
    ]);
    expect(git(repo, 'rev-list', '--count', `quest/${merge.id}..${main}`)).toBe('0');
    expect(await readFile(path.join(worktreeOf(merge), 'README.md'), 'utf8')).toBe('# dc1 rooms, on main\n');
    expect(git(worktreeOf(merge), 'status', '--porcelain')).toBe('');
    // The knight's submit counted from main: main's protected change and its files are not the party's.
    expect(merge.protected_changes).toBeUndefined();
    const submitted = (await openEventLog(kingdom.root).read()).events.filter(
      (event) => isEventOf(event, 'quest.submitted') && event.quest === merge.id,
    );
    expect(JSON.stringify(submitted)).not.toContain(MAIN_INFRA);
  }, 240_000);
});
