// A party on a territory that delivers by pull request (PS-08c, ADR 0020, 0023): the contract and its parts reach the
// base branch through the merge quest, so only the merge quest's branch goes to the forge.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { openEventLog } from '@elvaria/eventlog';
import { SUBQUESTS_FILE } from '@elvaria/runner-core';
import { afterEach, describe, expect, it } from 'vitest';

import { fakeForge } from './__fixtures__/forge.ts';
import { FORGE_REMOTE } from './__fixtures__/forge-bench.ts';
import { childEnv, git } from './__fixtures__/git-plots.ts';
import { RM_TEMP, tickUntil } from './__fixtures__/kingdom.ts';
import { CONTRACT, contractPayload, list, mergeOf, part, partyBench, reached } from './__fixtures__/party.ts';
import type { PartyBench } from './__fixtures__/party.ts';

let current: PartyBench | undefined;
let remote: string | undefined;

afterEach(async () => {
  await current?.remove();
  if (remote !== undefined) await rm(remote, RM_TEMP);
  current = undefined;
  remote = undefined;
});

const lines = async (party: PartyBench, type: string) =>
  (await openEventLog(party.kingdom.root).read()).events.filter((event) => event.type === type);

describe('a party on a territory that delivers by pull request', () => {
  it('pushes the merge quest alone, after its seal', async () => {
    const forge = fakeForge();
    current = await partyBench(
      {
        'Book a room': { [CONTRACT]: 'openapi: 3.1.0\n', [SUBQUESTS_FILE]: list(part('d1', 'Rooms API')) },
        'Rooms API': { 'apps/api/rooms.ts': 'export const rooms = [];\n' },
      },
      1,
      {},
      {
        territory: {
          vcs: { type: 'git', default_branch: 'main', remote: FORGE_REMOTE },
          delivery: { mode: 'pr' },
        },
        deps: { env: childEnv(), forges: { adapters: { github: forge }, git: { file: 'git', args: [] } } },
      },
    );
    const bare = await mkdtemp(path.join(os.tmpdir(), 'elvaria party remote '));
    remote = bare;
    git(bare, 'init', '-q', '--bare', '-b', 'main');
    git(current.repo, 'remote', 'add', 'origin', bare);
    git(current.repo, 'push', '-q', 'origin', 'main');
    const party = current;
    const { kingdom, steward } = party;
    await kingdom.command('create_quest', contractPayload('Book a room'));
    await tickUntil(
      steward,
      kingdom.clock,
      reached(() => mergeOf(kingdom), 'awaiting_seal'),
      300,
    );

    // The contract and the part are done and delivered, ticks ago: neither went to the forge.
    const done = (await kingdom.quests()).filter(({ status }) => status === 'done');
    expect(done.map(({ party_role: role }) => role).toSorted()).toEqual(['contract', 'part']);
    expect(done.every(({ deliverable }) => deliverable.delivered_at !== undefined)).toBe(true);
    expect(forge.calls).toEqual([]);
    expect(await lines(party, 'delivery.failed')).toEqual([]);

    const merge = await mergeOf(kingdom);
    await kingdom.command('seal', { quest: merge.id });
    const pushed = async () => (await lines(party, 'delivery.pushed')).length > 0;
    await tickUntil(steward, kingdom.clock, pushed);
    const [line, ...more] = await lines(party, 'delivery.pushed');
    expect(more).toEqual([]);
    expect(line?.data).toMatchObject({ quest: merge.id, branch: `quest/${merge.id}` });
    expect([...forge.pulls.keys()]).toEqual([`quest/${merge.id}`]);
    expect(git(bare, 'for-each-ref', '--format=%(refname)', 'refs/heads')).toBe(
      `refs/heads/main\nrefs/heads/quest/${merge.id}`,
    );
  }, 240_000);
});
