// The looks at the base branch (PS-08d, (E) of the PS-08 plan) under every delivery mode, here `manual`: a done quest
// the owner merged by hand is archived at the next look, every 10 minutes by the Steward's clock, with the parts and
// the contract of its party; a done quest whose branch has no commit of its own stays. And the Steward's stop aborts
// a question to the forge in flight ((ii) of PS-08c): nothing waits out the adapter's time limit, nothing is recorded.
import { SUBQUESTS_FILE } from '@elvaria/runner-core';
import { afterEach, describe, expect, it } from 'vitest';

import { delivered } from '../__fixtures__/deliver.ts';
import { forgeBench } from '../__fixtures__/forge-bench.ts';
import { git, gitPlots } from '../__fixtures__/git-plots.ts';
import { questPayload, tickUntil } from '../__fixtures__/kingdom.ts';
import {
  CONTRACT,
  contractPayload,
  list,
  mergeOf,
  part,
  partyBench,
  reached,
} from '../__fixtures__/party.ts';
import type { ForgeBench } from '../__fixtures__/forge-bench.ts';
import type { PartyBench } from '../__fixtures__/party.ts';
import type { Steward } from '../types.ts';
import type { StepClock } from '../__fixtures__/kingdom.ts';

let current: ForgeBench | undefined;
let party: PartyBench | undefined;

afterEach(async () => {
  await current?.remove();
  await party?.remove();
  current = undefined;
  party = undefined;
});

const LOOK_MINUTES = 10;

/** One tick, its work outside the tick ended, then `minutes` on the clock. */
async function beat(steward: Steward, clock: StepClock, minutes = 1): Promise<void> {
  await steward.tick();
  await steward.idle();
  clock.advance(minutes);
}

describe('a done quest the owner merged by hand on a manual territory', () => {
  it('is archived at the next look, every 10 minutes; a branch with no commit of its own stays done', async () => {
    current = await forgeBench({
      release: true,
      leaves: (req) =>
        req.quest?.title === 'Nothing' ? {} : { 'src/rooms.ts': 'export const rooms = [];\n' },
    });
    const bench = current;
    const { kingdom } = bench;
    const plots = gitPlots(kingdom.root);
    const looks: string[] = [];
    const steward = await bench.start({
      plots: {
        ...gitPlots(kingdom.root, { release: true }),
        baseTips: (territory) => {
          looks.push(territory.id);
          return plots.baseTips?.(territory) ?? Promise.resolve(undefined);
        },
      },
    });
    await kingdom.command('create_quest', questPayload('Rooms API'));
    await kingdom.command('create_quest', questPayload('Nothing'));
    const both = async () =>
      (await delivered(kingdom, 'Rooms API')()) && (await delivered(kingdom, 'Nothing')());
    await tickUntil(steward, kingdom.clock, both);
    await beat(steward, kingdom.clock, 0);
    const first = looks.length;
    expect(first).toBeGreaterThan(0);
    const rooms = await kingdom.quest('Rooms API');
    git(bench.repo, 'merge', '-q', '--no-ff', '-m', 'merged by hand', `quest/${rooms.id}`);

    for (let minute = 0; minute < LOOK_MINUTES - 1; minute += 1) await beat(steward, kingdom.clock);
    expect(looks).toHaveLength(first);
    expect((await kingdom.quest('Rooms API')).status).toBe('done');
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Rooms API')).status === 'archived',
    );
    expect(looks).toHaveLength(first + 1);
    expect((await kingdom.quest('Nothing')).status).toBe('done');
    expect(await bench.lines('delivery.pushed')).toEqual([]);
    expect(bench.forge.calls).toEqual([]);
  });

  // A whole party on real git with a bare origin, merged by hand, then the looks: 14 s beside 13 other slow
  // specs on Windows (2026-11-18), room for a busy machine.
  it("archives the merge quest with its party's contract and parts once its branch is in main", async () => {
    party = await partyBench(
      {
        'Book a room': { [CONTRACT]: 'openapi: 3.1.0\n', [SUBQUESTS_FILE]: list(part('d1', 'Rooms API')) },
        'Rooms API': { 'apps/api/rooms.ts': 'export const rooms = [];\n' },
      },
      1,
    );
    const { kingdom, steward, repo } = party;
    await kingdom.command('create_quest', contractPayload('Book a room'));
    await tickUntil(
      steward,
      kingdom.clock,
      reached(() => mergeOf(kingdom), 'awaiting_seal'),
      300,
    );
    const merge = await mergeOf(kingdom);
    await kingdom.command('seal', { quest: merge.id });
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await mergeOf(kingdom)).deliverable.delivered_at !== undefined,
    );
    expect((await kingdom.quests()).filter(({ status }) => status === 'archived')).toEqual([]);

    git(repo, 'merge', '-q', '--no-ff', '-m', 'merged by hand', `quest/${merge.id}`);
    const allArchived = async () => (await kingdom.quests()).every(({ status }) => status === 'archived');
    await tickUntil(steward, kingdom.clock, allArchived, 30);
    const roles = (await kingdom.quests()).map(({ party_role: role }) => role).toSorted();
    expect(roles).toEqual(['contract', 'merge', 'part']);
  }, 240_000);
});

describe("the Steward's stop during a question to the forge", () => {
  it('aborts the call in flight and records nothing; the next Steward asks again', async () => {
    current = await forgeBench({ delivery: { mode: 'pr_merge' } });
    const bench = current;
    const { kingdom } = bench;
    bench.forge.answer({ state: 'pending' });
    const first = await bench.start();
    await kingdom.command('create_quest', questPayload('Rooms API', { seal_required: true }));
    await tickUntil(
      first,
      kingdom.clock,
      async () => (await kingdom.quest('Rooms API')).status === 'awaiting_seal',
    );
    await kingdom.command('seal', { quest: (await kingdom.quest('Rooms API')).id });
    await tickUntil(first, kingdom.clock, async () => (await bench.lines('delivery.pushed')).length > 0);
    const held = bench.forge.holdStatus();
    kingdom.clock.advance(1);
    await first.tick();
    await held;
    // The forge never answers on its own: only the abort ends the call.
    await first.stop();
    expect(await bench.lines('delivery.failed')).toEqual([]);

    bench.forge.answer({ state: 'green' });
    const second = await bench.start();
    await tickUntil(second, kingdom.clock, async () => (await bench.lines('delivery.merged')).length > 0);
    expect(await bench.lines('delivery.failed')).toEqual([]);
  });
});
