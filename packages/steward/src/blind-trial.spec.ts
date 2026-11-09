// The blind trial (implementation-plan §3.15, ADR 0022; P1-21) on a real git repo with PlotManager and FakeRunners: a
// party on a territory that turned it on gets an acceptance part, written on the contract's branch by a character who
// works no part of the party, from a prompt holding no part's work; the merge quest merges it with the parts, its
// judge reads the merge quest's own work only, and each merge leaves a `plot.merged` line.
import path from 'node:path';

import { isEventOf, partyIssues } from '@elvaria/domain';
import { openEventLog, openJournal } from '@elvaria/eventlog';
import { SUBQUESTS_FILE } from '@elvaria/runner-core';
import { pathExists } from '@elvaria/store';
import { afterEach, describe, expect, it } from 'vitest';

import { noteOf } from './__fixtures__/deliver.ts';
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
import type { PartyBench } from './__fixtures__/party.ts';
import type { Quest } from '@elvaria/domain';

let current: PartyBench | undefined;

afterEach(async () => {
  await current?.remove();
  current = undefined;
});

const API_FILE = 'apps/api/rooms.ts';
const WEB_FILE = 'apps/web/rooms.ts';
const TESTS_FILE = 'tests/acceptance/rooms.spec.ts';

/** dc1-se-team with the blind trial on from rank D, and a knight of another family than the bench's two. */
const trialBench = () =>
  partyBench(
    {
      'Book a room': {
        [CONTRACT]: 'openapi: 3.1.0\n',
        [SUBQUESTS_FILE]: list(part('d1', 'Rooms API'), part('d2', 'Rooms page', { tags: ['frontend'] })),
      },
      'Rooms API': { [API_FILE]: 'export const rooms = [];\n' },
      'Rooms page': { [WEB_FILE]: 'export const page = 1;\n' },
      acceptance: { [TESTS_FILE]: 'it("books a room", () => {});\n' },
    },
    1,
    {},
    {
      territory: { blind_trial: { enabled: true, min_rank: 'D' } },
      cast: [{ id: 'ilse', cls: 'knight', tribe: 'gemini', model: 'gemini-3.8-flash-high', level: 5 }],
    },
  );

const assigneesOf = (quest: Quest) =>
  quest.attempt_log.flatMap(({ role, character }) =>
    role === 'assignee' && character !== null ? [character] : [],
  );

describe('a blind trial (P1-21)', () => {
  it("adds an acceptance part, written apart from the parts' work, that the merge quest merges and checks", async () => {
    current = await trialBench();
    const { kingdom, steward, repo, roles } = current;
    await kingdom.command('create_quest', contractPayload('Book a room'));
    await tickUntil(
      steward,
      kingdom.clock,
      reached(() => mergeOf(kingdom), 'awaiting_seal'),
      300,
    );

    const quests = await kingdom.quests();
    const byRole = (role: Quest['party_role']) => quests.filter(({ party_role: r }) => r === role);
    const [contract] = byRole('contract');
    const [tests] = byRole('acceptance');
    const parts = byRole('part');
    const merge = await mergeOf(kingdom);
    if (contract === undefined || tests === undefined) throw new Error('no contract or no acceptance part');
    expect(tests).toMatchObject({
      status: 'done',
      title: 'Book a room',
      kind: 'build',
      class_required: 'knight',
      tags: ['e2e'],
      party_id: contract.id,
      contract: CONTRACT,
      depends_on: [contract.id],
    });
    // The merge quest waits for the acceptance part after every part.
    expect(merge.depends_on.at(-1)).toBe(tests.id);
    expect(merge.depends_on.toSorted()).toEqual([...parts.map(({ id }) => id), tests.id].toSorted());

    // Its worktree started on the contract's branch: the contract is there, no part's work is.
    expect(git(repo, 'merge-base', `quest/${tests.id}`, `quest/${contract.id}`)).toBe(
      git(repo, 'rev-parse', `quest/${contract.id}`),
    );
    expect(await pathExists(path.join(worktreeOf(tests), CONTRACT))).toBe(true);
    for (const file of [API_FILE, WEB_FILE])
      expect(await pathExists(path.join(worktreeOf(tests), file))).toBe(false);
    // Its writer read the owner's description and the contract, never the parts' work, and worked no part.
    const writer = kingdom.requests.find((req) => req.quest?.id === tests.id && req.role === 'assignee');
    expect(writer?.prompt.user).toContain('Fake quest «Book a room»');
    for (const leak of ['Rooms API', 'Rooms page', 'export const rooms', API_FILE])
      expect(writer?.prompt.user).not.toContain(leak);
    const partAssignees = new Set(parts.flatMap(assigneesOf));
    expect(assigneesOf(tests).filter((writerId) => partAssignees.has(writerId))).toEqual([]);
    expect(partyIssues(quests)).toEqual([]);

    // Its own checks wait for the merge quest, which holds both sets of tests and runs every check.
    const roleOf = (quest: Quest) => roles.find(([runDir]) => runDir === `.runs/${quest.id}-1`)?.[1];
    expect([tests, merge].map(roleOf)).toEqual(['acceptance', 'merge']);
    for (const file of [CONTRACT, API_FILE, WEB_FILE, TESTS_FILE])
      expect(await pathExists(path.join(worktreeOf(merge), file))).toBe(true);
    expect(await noteOf(kingdom, tests)).toContain("This branch holds the blind trial's acceptance tests");
  }, 180_000);

  it("gives the merge quest's judge its own work, and logs each merge (P1-21 (d), (e))", async () => {
    current = await trialBench();
    const { kingdom, steward } = current;
    await kingdom.command('create_quest', contractPayload('Book a room'));
    await tickUntil(
      steward,
      kingdom.clock,
      reached(() => mergeOf(kingdom), 'awaiting_seal'),
      300,
    );

    const merge = await mergeOf(kingdom);
    const judge = kingdom.requests.find((req) => req.quest?.id === merge.id && req.role === 'verifier');
    expect(judge?.prompt.user).toContain("[The merge quest's own work: what changed after its last merge");
    expect(judge?.prompt.user).toContain('Nothing changed after the last merge.');
    expect(judge?.prompt.user).not.toContain('+export const rooms = [];');

    // One merge took every part in: one line, in the log and in the merge quest's journal.
    const line: unknown = expect.objectContaining({
      actor: { kind: 'steward' },
      quest: merge.id,
      data: { into: `quest/${merge.id}`, merged: merge.depends_on.map((id) => `quest/${id}`), pending: [] },
    });
    const log = (await openEventLog(kingdom.root).read()).events;
    const journal = (await openJournal(kingdom.root, merge.id).read()).events;
    for (const lines of [log, journal])
      expect(lines.filter((event) => isEventOf(event, 'plot.merged'))).toEqual([line]);
  }, 180_000);
});
