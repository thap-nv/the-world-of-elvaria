// The Steward's advisory (PS-09c, implementation-plan §3.16.2, ADR 0024 amended), on a real git repo under `manual`
// delivery: the owner merges a done quest by hand, the next look finds it in main, and before the archive the Steward
// files one memo to the quests at work whose scope meets the files it changed (shared paths aside). Each reads it once,
// in the next prompt of its assignee (a resumed session too), with a memo.delivered line in its journal; a judge never
// does; nobody answers it and it moves no quest. A Steward that stopped between the memo and the archive files it once.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { openEventLog } from '@elvaria/eventlog';
import type { Event, Memo, Quest } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { leavingRunners } from './__fixtures__/deliver.ts';
import { childEnv, git, gitPlots, gitRepoWith, onRepo } from './__fixtures__/git-plots.ts';
import { FAIL, RM_TEMP, bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import type { Leaves } from './__fixtures__/deliver.ts';
import type { Bench, Plays } from './__fixtures__/kingdom.ts';
import type { Steward, StewardDeps } from './types.ts';

const LEAVES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  // Its own file, one in the scope of Guests, one in that of Inns, and a shared one that meets the scope of Docs.
  Rooms: {
    'src/rooms/api.ts': 'export const rooms = [];\n',
    'src/guests/types.ts': 'export type Guest = { name: string };\n',
    'src/inns/rates.ts': 'export const rate = 3;\n',
    'docs/shared/notes.md': '- rooms\n',
  },
  Guests: { 'src/guests/api.ts': 'export const guests = [];\n' },
  Inns: { 'src/inns/api.ts': 'export const inns = [];\n' },
  Docs: { 'docs/guide.md': '# Guide\n' },
};
const leaves: Leaves = (req) => LEAVES[req.quest?.title ?? ''] ?? {};

const SCOPES: Readonly<Record<string, readonly string[]>> = {
  Rooms: ['src/rooms/**'],
  Guests: ['src/guests/**'],
  Inns: ['src/inns/**'],
  Docs: ['docs/**'],
};

interface Landing {
  readonly kingdom: Bench;
  readonly repo: string;
  readonly steward: Steward;
}

let current: { kingdom: Bench; repo: string; steward?: Steward } | undefined;

afterEach(async () => {
  await current?.steward?.stop();
  await current?.kingdom.remove();
  if (current !== undefined) await rm(current.repo, RM_TEMP);
  current = undefined;
});

/** dc1-se-team on a git repo with `docs/shared/**` shared, `manual` delivery; the Steward started without its loop. */
async function landing(plays: Plays, overrides: (kingdom: Bench) => Partial<StewardDeps> = () => ({})) {
  const repo = await mkdtemp(path.join(os.tmpdir(), 'elvaria advisory repo '));
  await gitRepoWith(repo, { 'README.md': '# dc1\n' });
  const kingdom = await bench({ plays });
  current = { kingdom, repo };
  await onRepo(kingdom, repo, [], { shared_paths: [{ glob: 'docs/shared/**', merge: 'union' }] });
  const steward = kingdom.steward({
    plots: gitPlots(kingdom.root),
    runners: leavingRunners(kingdom, leaves),
    env: childEnv(),
    ...overrides(kingdom),
  });
  current.steward = steward;
  const begun = await steward.start({ loop: false });
  if (!begun.ok) throw new Error(`fixture: ${begun.error}`);
  return { kingdom, repo, steward } satisfies Landing;
}

const create = (kingdom: Bench, title: string) =>
  kingdom.command('create_quest', questPayload(title, { scope_paths: SCOPES[title] }));

const statusIs =
  (kingdom: Bench, ...pairs: readonly (readonly [string, Quest['status']])[]) =>
  async () => {
    for (const [title, status] of pairs) if ((await kingdom.quest(title)).status !== status) return false;
    return true;
  };

const linesOf = async (kingdom: Bench, type: string): Promise<Event[]> =>
  (await openEventLog(kingdom.root).read()).events.filter((event) => event.type === type);

const memosOf = async (kingdom: Bench): Promise<Memo[]> => [...(await kingdom.store.memos.list()).items];

/** Rooms done and delivered, then merged by the owner into main, and archived at the Steward's next look. */
async function landRooms({ kingdom, repo, steward }: Landing): Promise<Quest> {
  await create(kingdom, 'Rooms');
  await tickUntil(
    steward,
    kingdom.clock,
    async () => (await kingdom.quest('Rooms')).deliverable.delivered_at !== undefined,
  );
  const rooms = await kingdom.quest('Rooms');
  git(repo, 'merge', '-q', '--no-ff', '-m', 'merged by hand', `quest/${rooms.id}`);
  await tickUntil(steward, kingdom.clock, statusIs(kingdom, ['Rooms', 'archived']));
  return rooms;
}

const assigneePrompts = (kingdom: Bench, quest: Quest): string[] =>
  kingdom.requests
    .filter(({ role, quest: asked }) => role === 'assignee' && asked?.id === quest.id)
    .map(({ prompt }) => prompt.user);

describe("the Steward's advisory as a quest reaches main (manual delivery, merged by hand)", () => {
  it('goes to the quests at work whose scope meets the files, once, and moves none of them', async () => {
    const plays = { work: { Guests: ['ask', 'submit', 'submit'], Inns: ['ask'], Docs: ['ask'] } } as const;
    const bench = await landing({ ...plays, verdicts: { Guests: [FAIL] } });
    const { kingdom, steward } = bench;
    await create(kingdom, 'Guests');
    await create(kingdom, 'Inns');
    await create(kingdom, 'Docs');
    const asked = statusIs(kingdom, ['Guests', 'blocked'], ['Inns', 'blocked'], ['Docs', 'blocked']);
    await tickUntil(steward, kingdom.clock, asked);
    const before = await Promise.all(['Guests', 'Inns', 'Docs'].map((title) => kingdom.quest(title)));
    const rooms = await landRooms(bench);
    const [guests, inns] = before as [Quest, Quest, Quest];

    const [memo, ...more] = await memosOf(kingdom);
    expect(more).toEqual([]);
    expect(memo).toMatchObject({
      kind: 'advisory',
      quest: rooms.id,
      to: { route: 'quests', quests: [guests.id, inns.id].toSorted() },
      refs: ['src/guests/types.ts', 'src/inns/rates.ts'],
      state: 'open',
    });
    expect(memo).not.toHaveProperty('from');
    expect(memo?.body).toContain(`Quest ${rooms.id} ("Rooms") reached the base branch at `);
    const [filed] = await linesOf(kingdom, 'memo.filed');
    expect(filed).toMatchObject({ actor: { kind: 'steward' }, quest: rooms.id, data: { kind: 'advisory' } });
    expect(filed?.data).not.toHaveProperty('from');
    expect(await linesOf(kingdom, 'memo.routed')).toMatchObject([{ data: { route: 'quests' } }]);
    // A memo changes no quest: the files of the quests it went to are as they were.
    for (const quest of before) expect(await kingdom.quest(quest.title)).toEqual(quest);

    // Inns leaves before reading it; Guests reads it in its resumed session after the owner's answer.
    await kingdom.command('cancel', { quest: inns.id });
    await kingdom.command('answer', { quest: guests.id, answer: 'Keep the guests API.' });
    await tickUntil(steward, kingdom.clock, () =>
      Promise.resolve(assigneePrompts(kingdom, guests).length === 2),
    );
    const resumed = kingdom.requests.filter(
      ({ role, quest }) => role === 'assignee' && quest?.id === guests.id,
    )[1];
    expect(resumed?.resume).toBeDefined();
    const read = assigneePrompts(kingdom, guests)[1] ?? '';
    expect(read).toMatch(/^# Going on/);
    expect(read).toContain('# Advisories: the base branch moved');
    expect(read).toContain('`src/guests/types.ts`');
    expect(read).not.toContain('src/inns/rates.ts');
    const delivered = await linesOf(kingdom, 'memo.delivered');
    expect(delivered).toMatchObject([{ quest: guests.id, attempt: 1, data: { memo: memo?.id } }]);
    const closed = (await memosOf(kingdom))[0];
    expect(closed).toMatchObject({ state: 'closed', outcome: { decision: 'delivered' } });
    expect(closed?.deliveries).toMatchObject([{ quest: guests.id, attempt: 1 }]);

    // Its judge never reads it; the session after the judge's return does not read it again.
    await tickUntil(steward, kingdom.clock, () =>
      Promise.resolve(assigneePrompts(kingdom, guests).length === 3),
    );
    expect(assigneePrompts(kingdom, guests)[2]).not.toContain('# Advisories');
    const judged = kingdom.requests.filter(
      ({ role, quest }) => role === 'verifier' && quest?.id === guests.id,
    );
    expect(judged.length).toBeGreaterThan(0);
    for (const request of judged) expect(request.prompt.user).not.toContain('# Advisories');
    expect(await linesOf(kingdom, 'memo.filed')).toHaveLength(1);
    expect(await linesOf(kingdom, 'memo.delivered')).toHaveLength(1);
  });

  it('is filed once by a Steward that stopped between the memo and the archive', async () => {
    let refused = 0;
    const bench = await landing({ work: { Guests: ['ask'] } }, (kingdom) => {
      const { quests } = kingdom.store;
      const write: typeof quests.write = (quest) => {
        if (quest.title !== 'Rooms' || quest.status !== 'archived' || refused > 0) return quests.write(quest);
        refused += 1;
        const error = { code: 'locked', file: `quests/${quest.id}.json`, message: 'held' } as const;
        return Promise.resolve({ ok: false, error });
      };
      return { store: { ...kingdom.store, quests: { ...quests, write } } };
    });
    const { kingdom, steward } = bench;
    await create(kingdom, 'Guests');
    await tickUntil(steward, kingdom.clock, statusIs(kingdom, ['Guests', 'blocked']));
    await landRooms(bench);
    expect(refused).toBe(1);
    expect(await memosOf(kingdom)).toHaveLength(1);
    expect(await linesOf(kingdom, 'memo.filed')).toHaveLength(1);
  });

  it('is filed by none in a kingdom whose registry has no kind routed to quests, with a warning', async () => {
    const bench = await landing({ work: { Guests: ['ask'] } });
    const { kingdom } = bench;
    const file = path.join(kingdom.root, 'registry', 'memos.json');
    const kinds = JSON.parse(await readFile(file, 'utf8')) as { memos: { route: string }[] };
    const older = { ...kinds, memos: kinds.memos.filter(({ route }) => route !== 'quests') };
    await writeFile(
      file,
      `${JSON.stringify(older, null, 2)}
`,
    );
    await create(kingdom, 'Guests');
    await tickUntil(bench.steward, kingdom.clock, statusIs(kingdom, ['Guests', 'blocked']));
    await landRooms(bench);
    expect(await memosOf(kingdom)).toEqual([]);
    expect(kingdom.warnings.some((line) => line.includes('no kind routed to quests'))).toBe(true);
  });
});
