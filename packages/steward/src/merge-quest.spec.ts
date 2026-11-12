// The merge quest of a party after the machine's run (implementation-plan §2.5, §3.13; P1-55, (e) of the P1-50 report):
// the Steward merges the parts a conflict left once the knight concluded it, before the checks; the machine's run
// takes no attempt, so the knights keep the whole budget, and a retry from the infirmary goes to a knight instead of
// running the machine again on the commit that just failed; closing the contract's list is a commit like the others.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { SUBQUESTS_FILE } from '@elvaria/runner-core';
import { fromPortable, pathExists } from '@elvaria/store';
import { afterEach, describe, expect, it } from 'vitest';

import { git } from './__fixtures__/git-plots.ts';
import { FAIL, PASS, tickUntil } from './__fixtures__/kingdom.ts';
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
import type { PartyBench } from './__fixtures__/party.ts';
import type { VerdictId } from '@elvaria/domain';

let current: PartyBench | undefined;

afterEach(async () => {
  await current?.remove();
  current = undefined;
});

/** The runs of the assignee role of the merge quest: [n, character, outcome]. */
const runsOf = (merge: Awaited<ReturnType<typeof mergeOf>>) =>
  merge.attempt_log
    .filter(({ role }) => role === 'assignee')
    .map(({ n, character, outcome }) => [n, character, outcome]);

describe('the parts a conflict left unmerged (P1-55)', () => {
  it('merges them before the checks once the knight concluded the conflict, so one session passes', async () => {
    const shared = 'apps/shared/rooms.ts';
    current = await partyBench({
      'Book a room': {
        [CONTRACT]: 'openapi: 3.1.0\n',
        [SUBQUESTS_FILE]: list(part('d1', 'One'), part('d2', 'Two'), part('d3', 'Three')),
      },
      One: { [shared]: 'export const n = 1;\n' },
      Two: { [shared]: 'export const n = 2;\n' },
      // Three conflicts with nothing: before P1-55 the party check sent the quest back for it, after a run of checks.
      Three: { 'apps/three.ts': 'export const three = 3;\n' },
      merge: { [shared]: 'export const n = 12;\n' },
    });
    const { kingdom, steward } = current;
    await kingdom.command('create_quest', contractPayload('Book a room'));
    await tickUntil(
      steward,
      kingdom.clock,
      reached(() => mergeOf(kingdom), 'awaiting_seal'),
      300,
    );

    const merge = await mergeOf(kingdom);
    // The machine stopped at Two's conflict; the knight's one session concluded it, and Three went in before checks.
    expect(runsOf(merge)).toEqual([
      [1, null, 'cancelled'],
      [2, 'thorn', 'submitted'],
    ]);
    const verdict = await kingdom.store.verdicts.read(`${merge.id}-2` as VerdictId);
    expect(verdict.ok && verdict.value).toMatchObject({ result: 'pass' });
    expect(verdict.ok && verdict.value.checks).toEqual([
      expect.objectContaining({ id: 'party', pass: true }),
    ]);
    expect(await readFile(path.join(worktreeOf(merge), 'apps/three.ts'), 'utf8')).toBe(
      'export const three = 3;\n',
    );
    expect(git(worktreeOf(merge), 'status', '--porcelain')).toBe('');
  }, 180_000);
});

describe('a merge quest and its attempts (P1-55)', () => {
  it('gives its knights every attempt, and sends a retry from the infirmary to a knight, not to the machine', async () => {
    // The contract's judge passes it. The merge quest shares its title: the machine's run fails, then three knight
    // sessions fail (max_attempts 3: the machine's run is no attempt), then the owner's retry runs a knight that passes.
    current = await partyBench(
      {
        'Book a room': {
          [CONTRACT]: 'openapi: 3.1.0\n',
          [SUBQUESTS_FILE]: list(part('d1', 'Rooms API')),
        },
        'Rooms API': { 'apps/api/rooms.ts': 'export const rooms = [];\n' },
        merge: { 'apps/api/rooms.ts': 'export const rooms = [] as const;\n' },
      },
      1,
      { verdicts: { 'Book a room': [PASS, FAIL, FAIL, FAIL, FAIL] } },
    );
    const { kingdom, steward } = current;
    await kingdom.command('create_quest', contractPayload('Book a room'));
    await tickUntil(
      steward,
      kingdom.clock,
      reached(() => mergeOf(kingdom), 'infirmary'),
      300,
    );

    const stalled = await mergeOf(kingdom);
    expect(stalled).toMatchObject({ status: 'infirmary', attempts: 3 });
    const knights = runsOf(stalled).slice(1);
    expect(runsOf(stalled)[0]).toEqual([1, null, 'submitted']);
    expect(knights).toHaveLength(3);
    expect(knights.every(([, character]) => typeof character === 'string')).toBe(true);

    await kingdom.command('retry', { quest: stalled.id });
    await tickUntil(
      steward,
      kingdom.clock,
      reached(() => mergeOf(kingdom), 'awaiting_seal'),
      300,
    );
    const retried = await mergeOf(kingdom);
    const runs = runsOf(retried);
    // One run more, a knight's: the machine did not run again on the commit that had just failed.
    expect(runs).toHaveLength(5);
    expect(runs.filter(([, character]) => character === null)).toHaveLength(1);
    expect(runs.at(-1)).toEqual([5, expect.any(String), 'submitted']);
    expect(retried.attempts).toBe(1);
  }, 240_000);
});

describe('closing the contract (P1-55)', () => {
  it('commits as the Steward does everywhere: a forbidden path changed in the plot stops it', async () => {
    current = await partyBench(
      {
        'Book a room': {
          [CONTRACT]: 'openapi: 3.1.0\n',
          [SUBQUESTS_FILE]: list(part('d1', 'Rooms API')),
        },
        'Rooms API': { 'apps/api/rooms.ts': 'export const rooms = [];\n' },
      },
      1,
      {},
      {
        territory: { laws: { forbidden_paths: ['infra/secrets/**'] } },
        // Once the list is removed from the contract's plot, a program is taken to have written a forbidden path.
        plots: (plots) => ({
          touched: async (plot) => {
            const touched = await plots.touched(plot);
            const gone =
              plot.path !== undefined &&
              !(await pathExists(path.join(fromPortable(plot.path), SUBQUESTS_FILE)));
            const contract = (await current?.kingdom.quests())?.find(
              ({ party_role: role }) => role === 'contract',
            );
            return gone && contract?.plot.path === plot.path
              ? [...touched, 'infra/secrets/key.txt']
              : touched;
          },
        }),
      },
    );
    const { kingdom, steward } = current;
    await kingdom.command('create_quest', contractPayload('Book a room'));
    const said = () => Promise.resolve(kingdom.warnings.some((line) => line.includes('stays on its branch')));
    await tickUntil(steward, kingdom.clock, said, 100);

    const contract = (await kingdom.quests()).find(({ party_role: role }) => role === 'contract');
    if (contract === undefined) throw new Error('no contract quest');
    expect(kingdom.warnings.join('\n')).toMatch(
      new RegExp(
        `${contract.id}: ${SUBQUESTS_FILE} stays on its branch: laws\\.forbidden_paths changed in the plot.*infra/secrets/key\\.txt`,
      ),
    );
    // The branch kept its own last commit: the removal of the list was not committed.
    expect(git(worktreeOf(contract), 'log', '-1', '--format=%s')).toBe(`chore: submit ${contract.id}`);
  }, 120_000);
});
