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
          part('d1', 'Rooms API'),
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
    const first = await kingdom.store.verdicts.read(`${merge.id}-1` as VerdictId);
    // Two conflicts: the first session concluded one, the check sent the quest back for the last part.
    expect(first.ok && first.value).toMatchObject({ result: 'fail', fail_kind: 'incomplete' });
    const second = await kingdom.store.verdicts.read(`${merge.id}-2` as VerdictId);
    expect(second.ok && second.value).toMatchObject({ result: 'pass' });
    expect(await readFile(path.join(worktreeOf(merge), shared), 'utf8')).toBe('export const n = 123;\n');
    const stopped = `${merge.id}: merging the parts stopped at quest/q_\\d{8}_[0-9a-z]{6} \\(conflict\\): ${shared}`;
    expect(kingdom.warnings.join('\n')).toMatch(new RegExp(stopped));
  }, 180_000);
});
