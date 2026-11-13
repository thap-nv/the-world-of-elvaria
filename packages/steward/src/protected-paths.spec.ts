// Protected paths on the Steward's bench (implementation-plan §3.16.4, ADR 0026, PS-04): work that changed a path of
// laws.protected_paths is committed and judged as any other, but the quest waits for the royal seal whatever its
// kind's seal_default, and its judge is the stronger one, as on a quest of rank B or above. Work elsewhere goes on as
// before. A plot whose changes the spec chooses (folderPlots with its own `touched`); a party on a real git repo, whose
// merge quest the machine merges.
import { SUBQUESTS_FILE } from '@elvaria/runner-core';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { CONTRACT, contractPayload, list, mergeOf, part, partyBench, reached } from './__fixtures__/party.ts';
import { plotsWith, statusIs } from './__fixtures__/review.ts';
import { protectedChangesIn } from './sessions/commit.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Context } from './context.ts';
import type { PartyBench } from './__fixtures__/party.ts';
import type { Steward } from './types.ts';
import type { Quest, TerritoryId } from '@elvaria/domain';

let current: Bench | undefined;
let running: Steward | undefined;
let party: PartyBench | undefined;

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  await party?.remove();
  running = undefined;
  current = undefined;
  party = undefined;
});

// An astrologer to analyze; two judges of another family, equally idle: the weaker comes first by id (byIdleSince).
const CAST = [
  { id: 'vega', cls: 'astrologer' },
  { id: 'ilse', cls: 'judge', tribe: 'gemini', model: 'gemini-3.8-flash-high', level: 2 },
  { id: 'wren', cls: 'judge', tribe: 'gemini', model: 'gemini-3.5-pro', level: 4 },
] as const;

const PROTECTED = ['.claude/**', 'CLAUDE.md', 'packages/hooks/**'];

/** An `analyze` quest (seal_default false) of rank E, its seal off as the kind says. */
const analysis = (title: string) =>
  questPayload(title, { kind: 'analyze', rank: 'E', class_required: 'astrologer', tags: [] });

/** dc1-se-team naming PROTECTED, its plots changing `touched`; the Steward started. */
async function open(touched: readonly string[]): Promise<{ kingdom: Bench; steward: Steward }> {
  current = await bench({ cast: CAST });
  const read = await current.store.territories.read('dc1-se-team' as TerritoryId);
  if (!read.ok) throw new Error('fixture: dc1-se-team');
  const laws = { ...read.value.laws, protected_paths: PROTECTED };
  await current.store.territories.write({ ...read.value, laws });
  running = current.steward({
    plots: plotsWith(current.root, { touched: () => Promise.resolve([...touched]) }),
  });
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

const judgeOf = (kingdom: Bench): string | undefined =>
  kingdom.requests.find(({ role }) => role === 'verifier')?.character.id;

describe('a quest whose work changed a protected path (PS-04)', () => {
  it('waits for the royal seal although its kind has none, judged by the stronger judge', async () => {
    const touched = ['docs/notes.md', 'packages/hooks/src/run-hook.ts', 'sub/CLAUDE.md'];
    const { kingdom, steward } = await open(touched);
    await kingdom.command('create_quest', analysis('Hook analysis'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Hook analysis', 'awaiting_seal'));
    const quest = await kingdom.quest('Hook analysis');
    expect(quest.seal_required).toBe(true);
    // A glob matches at any depth, as for forbidden_paths: `CLAUDE.md` names the one of a sub-folder too.
    expect(quest.protected_changes).toEqual(['packages/hooks/src/run-hook.ts', 'sub/CLAUDE.md']);
    expect(judgeOf(kingdom)).toBe('wren');
    expect(kingdom.notices).toContainEqual({
      kind: 'awaiting_seal',
      quest: expect.objectContaining({ id: quest.id }) as unknown,
    });
  });

  it('goes on as before when its work changed none: no seal, the judge idle the longest', async () => {
    const { kingdom, steward } = await open(['docs/notes.md', 'packages/hooks-notes.md']);
    await kingdom.command('create_quest', analysis('Notes analysis'));
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, 'Notes analysis', 'done'));
    const quest = await kingdom.quest('Notes analysis');
    expect(quest.seal_required).toBe(false);
    expect(quest.protected_changes).toBeUndefined();
    expect(judgeOf(kingdom)).toBe('ilse');
  });
});

describe('a party whose part changed a protected path (PS-04)', () => {
  it('marks the part, and the merge quest the machine merges it into', async () => {
    party = await partyBench(
      {
        'Book a room': { [CONTRACT]: 'openapi: 3.1.0\n', [SUBQUESTS_FILE]: list(part('d1', 'Rooms API')) },
        'Rooms API': { 'apps/api/rooms.ts': 'export const rooms = [];\n' },
      },
      1,
      {},
      { territory: { laws: { protected_paths: ['apps/api/**'] } } },
    );
    const { kingdom, steward } = party;
    await kingdom.command('create_quest', contractPayload('Book a room'));
    await tickUntil(
      steward,
      kingdom.clock,
      reached(() => kingdom.quest('Rooms API'), 'awaiting_seal'),
      200,
    );
    const api = await kingdom.quest('Rooms API');
    expect(api).toMatchObject({ seal_required: true, protected_changes: ['apps/api/rooms.ts'] });
    // The contract's own change is outside the protected paths: it went on without a seal.
    const contract = (await kingdom.quests()).find(({ party_role: role }) => role === 'contract');
    expect(contract).toMatchObject({ status: 'done', seal_required: false });
    expect(contract?.protected_changes).toBeUndefined();

    await kingdom.command('seal', { quest: api.id });
    await tickUntil(
      steward,
      kingdom.clock,
      reached(() => mergeOf(kingdom), 'awaiting_seal'),
      200,
    );
    const merge = await mergeOf(kingdom);
    expect(merge.assignee).toBeNull();
    expect(merge.protected_changes).toEqual(['apps/api/rooms.ts']);
  }, 120_000);
});

describe('protectedChangesIn', () => {
  const warnings: string[] = [];
  const ctx = (protectedPaths: readonly string[] | undefined, touched: () => Promise<readonly string[]>) =>
    ({
      deps: { plots: { touched }, log: { warn: (message: string) => warnings.push(message) } },
      world: { territories: new Map([['dc1-se-team', { laws: { protected_paths: protectedPaths } }]]) },
    }) as unknown as Context;
  const quest = { id: 'q_20261107_aaaaaa', territory: 'dc1-se-team' } as unknown as Quest;

  it('asks git nothing on a territory without protected paths, and says when git cannot tell', async () => {
    const never = () => Promise.reject(new Error('never asked'));
    expect(await protectedChangesIn(ctx(undefined, never), quest)).toEqual([]);
    const gone = () => Promise.reject(new Error('git gone'));
    expect(await protectedChangesIn(ctx(['CLAUDE.md'], gone), quest)).toEqual([]);
    expect(warnings).toEqual([
      'steward: q_20261107_aaaaaa: the protected paths its work changed are unknown: git gone',
    ]);
    const found = () => Promise.resolve(['CLAUDE.md', 'README.md']);
    expect(await protectedChangesIn(ctx(['CLAUDE.md'], found), quest)).toEqual(['CLAUDE.md']);
  });
});
