// A party (implementation-plan §3.13, ADR 0020; P1-18) on a real git repo with PlotManager and FakeRunners: the
// contract quest's delivery opens the parts and the merge quest, the parts branch from the contract, the merge quest
// gets them merged before its knight's session and checked before its judge, nobody of the party judges it, and the
// merge quest waits for the royal seal.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { partyIssues } from '@elvaria/domain';
import { SUBQUESTS_FILE } from '@elvaria/runner-core';
import { inKingdom, pathExists } from '@elvaria/store';
import { afterEach, describe, expect, it } from 'vitest';

import { noteOf } from './__fixtures__/deliver.ts';
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
import type { Quest, VerdictId } from '@elvaria/domain';

let current: PartyBench | undefined;

afterEach(async () => {
  await current?.remove();
  current = undefined;
});

describe('a party, from its contract to its merge quest (P1-18)', () => {
  it('opens the parts on the contract branch, merges them, and waits for the seal, judged from outside', async () => {
    current = await partyBench({
      'Book a room': {
        [CONTRACT]: 'openapi: 3.1.0\n',
        [SUBQUESTS_FILE]: list(
          // The draft leaves the seal out, as the mage is told to: a build part waits for none (gap 9 of PS-07).
          part('d1', 'Rooms API', { seal_required: undefined }),
          part('d2', 'Rooms page', { tags: ['frontend'], depends_on_refs: ['d1'] }),
        ),
      },
      'Rooms API': { 'apps/api/rooms.ts': 'export const rooms = [];\n' },
      'Rooms page': { 'apps/web/rooms.ts': 'export const page = 1;\n' },
    });
    const { kingdom, steward, repo, roles } = current;
    await kingdom.command('create_quest', contractPayload('Book a room'));
    await tickUntil(
      steward,
      kingdom.clock,
      reached(() => mergeOf(kingdom), 'awaiting_seal'),
      200,
    );

    const contract = (await kingdom.quests()).find(({ party_role: role }) => role === 'contract');
    if (contract === undefined) throw new Error('no contract quest');
    const api = await kingdom.quest('Rooms API');
    const page = await kingdom.quest('Rooms page');
    const merge = await mergeOf(kingdom);
    expect(api).toMatchObject({
      status: 'done',
      seal_required: false,
      party_id: contract.id,
      party_role: 'part',
      contract: CONTRACT,
      depends_on: [contract.id],
      parent_id: contract.id,
    });
    expect(page).toMatchObject({ party_role: 'part', depends_on: [contract.id, api.id] });
    expect(merge).toMatchObject({
      title: 'Book a room',
      kind: 'build',
      class_required: 'knight',
      party_id: contract.id,
      contract: CONTRACT,
      tags: ['backend', 'frontend'],
      depends_on: [api.id, page.id],
      seal_required: true,
      checks_run: ['party'],
    });

    // The contract branch lost its list once the parts were open; each part started from it.
    expect(git(worktreeOf(contract), 'log', '-1', '--format=%s')).toBe(
      `chore: remove ${SUBQUESTS_FILE} of ${contract.id}, its parts are open`,
    );
    expect(git(repo, 'merge-base', `quest/${api.id}`, `quest/${contract.id}`)).toBe(
      git(repo, 'rev-parse', `quest/${contract.id}`),
    );
    // The second part waits for the first, so it starts on the first's branch, contract included.
    expect(git(repo, 'merge-base', `quest/${page.id}`, `quest/${api.id}`)).toBe(
      git(repo, 'rev-parse', `quest/${api.id}`),
    );
    expect(await pathExists(path.join(worktreeOf(api), SUBQUESTS_FILE))).toBe(false);
    expect(await readFile(path.join(worktreeOf(api), CONTRACT), 'utf8')).toBe('openapi: 3.1.0\n');

    // The merge quest holds the contract and both parts, and its check says so.
    for (const file of [CONTRACT, 'apps/api/rooms.ts', 'apps/web/rooms.ts'])
      expect(await pathExists(path.join(worktreeOf(merge), file))).toBe(true);
    // Both parts merged cleanly, so the machine made the run and no knight's session opened on it (P1-18 (h)).
    expect(merge.assignee).toBeNull();
    expect(merge.attempt_log.filter(({ role }) => role === 'assignee')).toEqual([
      expect.objectContaining({ n: 1, character: null, outcome: 'submitted' }),
    ]);
    const sessions = kingdom.requests.filter((req) => req.quest?.id === merge.id);
    expect(sessions.map(({ role }) => role)).toEqual(['verifier']);
    const verdict = await kingdom.store.verdicts.read(`${merge.id}-1` as VerdictId);
    expect(verdict.ok && verdict.value.checks).toEqual([
      expect.objectContaining({ id: 'party', pass: true }),
    ]);
    const log = await readFile(inKingdom(kingdom.root, `.runs/${merge.id}-1/checks/party.log`), 'utf8');
    expect(log).toBe(
      `party: every part of party ${contract.id} is merged into quest/${merge.id}\n✓ quest/${api.id}\n✓ quest/${page.id}\n`,
    );
    // Nobody who worked on the party judged any quest of it (ADR 0020).
    expect(partyIssues(await kingdom.quests())).toEqual([]);
    // The territory's checks are asked for by the quest's place in the party (§3.15: deferred to the merge quest).
    const roleOf = (quest: Quest) => roles.find(([runDir]) => runDir === `.runs/${quest.id}-1`)?.[1];
    expect([contract, api, page, merge].map(roleOf)).toEqual(['contract', 'part', 'part', 'merge']);

    expect(await noteOf(kingdom, contract)).toContain('## Party');
    const apiNote = await noteOf(kingdom, api);
    expect(apiNote).toContain(`- Branch: \`quest/${api.id}\`, from \`quest/${contract.id}\``);
    expect(apiNote).toContain(`Do not merge it alone: merge quest \`${merge.id}\``);
    expect(apiNote).not.toContain('## Merge by hand');

    await kingdom.command('seal', { quest: merge.id });
    const sent = async () => (await mergeOf(kingdom)).deliverable.delivered_at !== undefined;
    await tickUntil(steward, kingdom.clock, sent);
    const mergeNote = await noteOf(kingdom, await mergeOf(kingdom));
    expect(mergeNote).toContain(`Party \`${contract.id}\`: done, 2 of 2 parts done.`);
    expect(mergeNote).toContain(`merge --no-ff quest/${merge.id}`);
  }, 120_000);

  it("opens the machine's merge a judge failed for a knight, whose session reads the verdict (P1-18 (h))", async () => {
    // The contract's judge passes it; the merge quest shares its title, and its first judge fails the machine's run.
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
      { verdicts: { 'Book a room': [PASS, FAIL] } },
    );
    const { kingdom, steward } = current;
    await kingdom.command('create_quest', contractPayload('Book a room'));
    await tickUntil(
      steward,
      kingdom.clock,
      reached(() => mergeOf(kingdom), 'awaiting_seal'),
      200,
    );

    const merge = await mergeOf(kingdom);
    const runs = merge.attempt_log.filter(({ role }) => role === 'assignee');
    // Whichever knight is free takes run 2 (thorn or kael of the bench).
    expect(runs.map(({ n, character }) => [n, character])).toEqual([
      [1, null],
      [2, merge.assignee],
    ]);
    expect(['thorn', 'kael']).toContain(merge.assignee);
    const failed = await kingdom.store.verdicts.read(`${merge.id}-1` as VerdictId);
    expect(failed.ok && failed.value).toMatchObject({ result: 'fail' });
    const knight = kingdom.requests.find((req) => req.quest?.id === merge.id && req.role === 'assignee');
    expect(knight?.prompt.user).toContain(FAIL.notes);
  }, 120_000);

  it("leaves a conflict to the merge quest's knight, and sends it back for a part still not merged", async () => {
    const shared = 'apps/shared/rooms.ts';
    current = await partyBench({
      'Book a room': {
        [CONTRACT]: 'openapi: 3.1.0\n',
        [SUBQUESTS_FILE]: list(part('d1', 'One'), part('d2', 'Two'), part('d3', 'Three')),
      },
      One: { [shared]: 'export const n = 1;\n' },
      Two: { [shared]: 'export const n = 2;\n' },
      Three: { [shared]: 'export const n = 3;\n' },
      merge: { [shared]: 'export const n = 123;\n' },
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
    // Run 1 is the machine's: it stopped on the first conflict and left the merge to a knight, judging nothing.
    const runs = merge.attempt_log.filter(({ role }) => role === 'assignee');
    expect(runs.map(({ n, character, outcome }) => [n, character, outcome])).toEqual([
      [1, null, 'cancelled'],
      [2, 'thorn', 'submitted'],
      [3, 'thorn', 'submitted'],
    ]);
    expect((await kingdom.store.verdicts.read(`${merge.id}-1` as VerdictId)).ok).toBe(false);
    const second = await kingdom.store.verdicts.read(`${merge.id}-2` as VerdictId);
    // Two conflicts: the knight's first session concluded one, the check sent it back for the last part.
    expect(second.ok && second.value).toMatchObject({ result: 'fail', fail_kind: 'incomplete' });
    const third = await kingdom.store.verdicts.read(`${merge.id}-3` as VerdictId);
    expect(third.ok && third.value).toMatchObject({ result: 'pass' });
    expect(await readFile(path.join(worktreeOf(merge), shared), 'utf8')).toBe('export const n = 123;\n');
    const stopped = `${merge.id}: merging the parts stopped at quest/q_\\d{8}_[0-9a-z]{6} \\(conflict\\): ${shared}`;
    expect(kingdom.warnings.join('\n')).toMatch(new RegExp(`${stopped}; a knight takes the quest`));
  }, 180_000);
});
