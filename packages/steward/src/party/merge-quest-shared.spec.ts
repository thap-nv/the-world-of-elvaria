// A party's merge quest whose parts meet in a hot file of the territory (PS-09, fix/merge-quest-followups (m)): the
// machine's run merges by the territory's shared_paths as the merge before a knight's session does, so parts that both
// regenerated an index are resolved by its `regenerate` rule and the generators write it anew; no knight is called.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isEventOf } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { SUBQUESTS_FILE } from '@elvaria/runner-core';
import { afterEach, describe, expect, it } from 'vitest';

import { git } from '../__fixtures__/git-plots.ts';
import { tickUntil } from '../__fixtures__/kingdom.ts';
import {
  CONTRACT,
  contractPayload,
  list,
  mergeOf,
  part,
  partyBench,
  reached,
  worktreeOf,
} from '../__fixtures__/party.ts';
import { QUEUE_FILES, QUEUE_TERRITORY, indexOf, sourceWithIndex } from '../__fixtures__/queue.ts';
import type { PartyBench } from '../__fixtures__/party.ts';

let current: PartyBench | undefined;

afterEach(async () => {
  await current?.remove();
  current = undefined;
});

/** Commits `files` on the territory's main before the party forks: the generator and the index it writes. */
async function onMain(repo: string, files: Readonly<Record<string, string>>): Promise<void> {
  for (const [file, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(repo, file)), { recursive: true });
    await writeFile(path.join(repo, file), text);
  }
  git(repo, 'add', '--all');
  git(repo, 'commit', '-q', '-m', 'the generator and its index');
}

describe("the machine's run of a party's merge quest (fix/merge-quest-followups (m))", () => {
  // A whole party on real git, its generator run in the merge quest's plot: some 20 s beside other slow specs on
  // Windows, room for a busy machine.
  it('resolves parts that both regenerated one file by its rule, and runs the generators on the result', async () => {
    current = await partyBench(
      {
        'Book a room': {
          [CONTRACT]: 'openapi: 3.1.0\n',
          [SUBQUESTS_FILE]: list(part('d1', 'Rooms API'), part('d2', 'Rooms page')),
        },
        'Rooms API': sourceWithIndex('rooms.ts'),
        'Rooms page': sourceWithIndex('page.ts'),
      },
      1,
      {},
      { territory: QUEUE_TERRITORY },
    );
    const { kingdom, steward, repo } = current;
    await onMain(repo, QUEUE_FILES);
    await kingdom.command('create_quest', contractPayload('Book a room'));
    await tickUntil(
      steward,
      kingdom.clock,
      reached(() => mergeOf(kingdom), 'awaiting_seal'),
      300,
    );

    const merge = await mergeOf(kingdom);
    const runs = merge.attempt_log
      .filter(({ role }) => role === 'assignee')
      .map(({ n, character, outcome }) => [n, character, outcome]);
    expect(runs).toEqual([[1, null, 'submitted']]);
    expect(kingdom.notices.filter(({ kind }) => kind === 'merge_stopped')).toEqual([]);
    expect(await readFile(path.join(worktreeOf(merge), 'docs/gen/index.txt'), 'utf8')).toBe(
      indexOf('page.ts', 'rooms.ts'),
    );
    expect(git(worktreeOf(merge), 'status', '--porcelain')).toBe('');
    const merged = (await openEventLog(kingdom.root).read()).events.filter(
      (event) => isEventOf(event, 'plot.merged') && event.quest === merge.id,
    );
    expect(merged.map(({ data }) => data.resolved)).toEqual([
      [{ path: 'docs/gen/index.txt', rule: 'regenerate' }],
    ]);
  }, 240_000);

  // A whole party on real git up to its merge quest's first run: some 10 s beside other slow specs on Windows, room for
  // a busy machine.
  it('gives the run to a knight when its merge or the setup after it throws, as when it stops', async () => {
    current = await partyBench(
      {
        'Book a room': { [CONTRACT]: 'openapi: 3.1.0\n', [SUBQUESTS_FILE]: list(part('d1', 'Rooms API')) },
        'Rooms API': sourceWithIndex('rooms.ts'),
      },
      1,
      {},
      { plots: () => ({ merge: () => Promise.reject(new Error('git died')) }) },
    );
    const { kingdom, steward } = current;
    await kingdom.command('create_quest', contractPayload('Book a room'));
    const machineRan = async () => {
      const merge = (await kingdom.quests()).find(({ party_role: role }) => role === 'merge');
      return merge?.attempt_log.some(({ outcome }) => outcome !== undefined) === true;
    };
    await tickUntil(steward, kingdom.clock, machineRan, 200);

    const merge = await mergeOf(kingdom);
    expect(merge.attempt_log.map(({ n, character, outcome }) => [n, character, outcome])).toEqual([
      [1, null, 'cancelled'],
    ]);
    expect(kingdom.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`${merge.id}: the machine's merge failed: git died`),
        expect.stringContaining(`${merge.id}: the machine's run stopped (failed); a knight takes the quest`),
      ]),
    );
  }, 240_000);
});
