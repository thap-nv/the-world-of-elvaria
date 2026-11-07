// A throwaway kingdom for the Steward's specs: what `elvaria init` lays out (the default registry, read from
// packages/registry-default by path because the Steward may not depend on it, implementation-plan §1.3), two
// territories, a cast, and FakeRunners for both tribes whose verifiers hand in a verdict.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  CharacterSchema,
  KingdomSchema,
  REGISTRY_FILES,
  TerritorySchema,
  createIdSource,
  worldStateOf,
} from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { createFakeRunner } from '@elvaria/runner-core';
import { initKingdom, openKingdom } from '@elvaria/store';
import type {
  Character,
  Clock,
  IdSource,
  InboxCommandInput,
  Instant,
  Quest,
  WorldState,
} from '@elvaria/domain';
import type { AgentRunner, FakeRunner, FakeScenario, SpawnRequest } from '@elvaria/runner-core';
import type { KingdomStore } from '@elvaria/store';

import { folderPlots } from '../plots.ts';
import { createSteward } from '../steward.ts';
import type { Notice, Steward, StewardDeps } from '../types.ts';

const REGISTRY_DIR = path.join(import.meta.dirname, '..', '..', '..', 'registry-default');

/** A clock the spec moves: one minute per tick by default. */
export interface StepClock extends Clock {
  advance(minutes: number): void;
}

export function stepClock(start = '2026-11-07T09:00:00+07:00'): StepClock {
  let now = Date.parse(start);
  return {
    now: () => now as Instant,
    advance: (minutes) => {
      now += minutes * 60_000;
    },
  };
}

/** Ids from a counter: the same spec always writes the same ids. */
export function seededIds(clock: Clock): IdSource {
  let counter = 0;
  const ids = createIdSource({
    clock,
    tz: 'Asia/Ho_Chi_Minh',
    random: {
      bytes: (count) => {
        counter += 1;
        return Uint8Array.from({ length: count }, (_, index) => (counter * 31 + index * 7) % 256);
      },
    },
  });
  if (!ids.ok) throw new Error('fixture: tz');
  return ids.value;
}

export const KINGDOM = KingdomSchema.parse({
  version: 1,
  name: 'Bình Minh',
  created_at: '2026-11-01T08:00:00+07:00',
  tz: 'Asia/Ho_Chi_Minh',
  owner: { profession: 'developer', locale: 'vi' },
  paths: { treasury: 'C:/Users/owner/.elvaria/treasury.json' },
  tribes: [
    { id: 'claude', adapter: 'claude_code', enabled: true, max_concurrent: 2 },
    { id: 'gemini', adapter: 'antigravity', enabled: true, max_concurrent: 1 },
  ],
  mana: {},
  breakers: {},
  schedule: {},
  dispatch: {},
  bell: {},
  tunnel: {},
  theme: 'fantasy',
  ui: {},
});

const territory = (id: string, kind: 'code' | 'docs', maxConcurrent: number) =>
  TerritorySchema.parse({
    version: 1,
    id,
    name: id,
    path: `C:/repos/${id}`,
    kind,
    vcs: { type: 'none', default_branch: 'main' },
    max_concurrent: maxConcurrent,
  });

export interface CastMember {
  readonly id: string;
  readonly cls: string;
  readonly tribe?: string;
  readonly model?: string;
  readonly level?: number;
  readonly status?: 'idle' | 'suspended';
  /** Passed verdicts from earlier days in the reputation window. */
  readonly passes?: number;
}

const earlierPasses = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    verdict_id: `q_20261105_aaaa${String(index).padStart(2, '0')}-1`,
    result: 'pass',
    by_human: false,
    at: '2026-11-05T10:00:00+07:00',
  }));

export const characterOf = (member: CastMember): Character =>
  CharacterSchema.parse({
    version: 1,
    id: member.id,
    name: member.id.charAt(0).toUpperCase() + member.id.slice(1),
    class: member.cls,
    tribe: member.tribe ?? 'claude',
    model: member.model ?? 'claude-sonnet-5-5',
    level: member.level ?? 3,
    reputation: { window: earlierPasses(member.passes ?? 0) },
    status: member.status ?? 'idle',
    status_since: '2026-11-07T08:00:00+07:00',
    current: null,
    vow_no_production: member.cls === 'judge',
    consecutive_fail: { count: 0 },
    stats: { quests_done: 0, tokens_today: 0, tokens_day: '2026-11-07' },
    created_at: '2026-11-01T08:00:00+07:00',
  });

/** Knights and a scribe to work, a judge of each tribe to verify (different models from every worker). */
export const CAST: readonly CastMember[] = [
  { id: 'thorn', cls: 'knight', level: 5 },
  { id: 'kael', cls: 'knight', level: 3 },
  { id: 'wren', cls: 'scribe', tribe: 'gemini', model: 'gemini-4-argon-medium' },
  { id: 'sable', cls: 'judge', model: 'claude-opus-5-5', level: 6 },
  { id: 'orin', cls: 'judge', tribe: 'gemini', model: 'gemini-3.8-flash-low', level: 6 },
];

/** What a fake verifier hands in: pass unless the plays say otherwise. */
export const PASS = { result: 'pass' };
export const FAIL = {
  result: 'fail',
  fail_kind: 'tests_fail',
  notes: 'pnpm test fails in src/api/orders.spec.ts: the total ignores the discount.',
};

/**
 * What each session of a quest plays, by quest title, in order: an assignee takes the next scenario (submit when
 * none is left), a verifier the next verdict (pass when none is left).
 */
export interface Plays {
  readonly work?: Readonly<Record<string, readonly FakeScenario[]>>;
  readonly verdicts?: Readonly<Record<string, readonly unknown[]>>;
}

function scripted(plays: Plays) {
  const used = new Map<string, number>();
  const next = <T>(
    table: Readonly<Record<string, readonly T[]>> | undefined,
    key: string,
    fallback: T,
  ): T => {
    const index = used.get(key) ?? 0;
    used.set(key, index + 1);
    return table?.[key.slice(key.indexOf(':') + 1)]?.[index] ?? fallback;
  };
  return {
    scenario: (req: SpawnRequest): FakeScenario =>
      req.role === 'assignee' ? next(plays.work, `work:${req.quest?.title ?? ''}`, 'submit') : 'submit',
    verdict: (req: SpawnRequest): unknown => next(plays.verdicts, `verdict:${req.quest?.title ?? ''}`, PASS),
  };
}

/** A FakeRunner whose verifier sessions end with a verdict as structured output, as `--json-schema` gives it. */
function judgingRunner(fake: FakeRunner, verdictOf: (req: SpawnRequest) => unknown): AgentRunner {
  return {
    ...fake,
    spawn: async (req) => {
      const session = await fake.spawn(req);
      if (req.role !== 'verifier') return session;
      return { ...session, wait: async () => ({ ...(await session.wait()), structured: verdictOf(req) }) };
    },
  };
}

export interface Bench {
  readonly root: string;
  readonly store: KingdomStore;
  readonly clock: StepClock;
  readonly ids: IdSource;
  readonly fakes: { readonly claude: FakeRunner; readonly gemini: FakeRunner };
  readonly notices: Notice[];
  readonly warnings: string[];
  /** The morning: the world the files described before the first tick. */
  readonly morning: () => Promise<WorldState>;
  steward(overrides?: Partial<StewardDeps>): Steward;
  /** Drops a command into the inbox; `id` sends one again under the id it had. */
  command(kind: InboxCommandInput['kind'], payload: Record<string, unknown>, id?: string): Promise<string>;
  quests(): Promise<Quest[]>;
  quest(title: string): Promise<Quest>;
  character(id: string): Promise<Character>;
  remove(): Promise<void>;
}

export interface BenchOptions {
  readonly cast?: readonly CastMember[];
  readonly plays?: Plays;
  /** max_concurrent of dc1-se-team (code) and handbook (docs). */
  readonly room?: { readonly code: number; readonly docs: number };
}

async function sourceOf(store: KingdomStore) {
  const kingdom = await store.kingdom.read();
  if (!kingdom.ok) throw new Error('fixture: kingdom');
  const [territories, characters, quests] = await Promise.all([
    store.territories.list(),
    store.characters.list(),
    store.quests.list(),
  ]);
  return {
    kingdom: kingdom.value,
    territories: territories.items,
    characters: characters.items,
    quests: quests.items,
    campaigns: [],
  };
}

/** The world the files describe now: what the log, replayed, must give back. */
export const worldOfFiles = async (store: KingdomStore): Promise<WorldState> =>
  worldStateOf(await sourceOf(store));

export async function bench(options: BenchOptions = {}): Promise<Bench> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'elvaria steward-'));
  const files = REGISTRY_FILES.map((file) => `${file}.json`);
  const made = await initKingdom(root, KINGDOM, { root: REGISTRY_DIR, files });
  if (!made.ok) throw new Error(`fixture: ${made.error.message}`);
  const store = openKingdom(root);
  const room = options.room ?? { code: 2, docs: 1 };
  await store.territories.write(territory('dc1-se-team', 'code', room.code));
  await store.territories.write(territory('handbook', 'docs', room.docs));
  for (const member of options.cast ?? CAST) await store.characters.write(characterOf(member));
  const morning = worldStateOf(await sourceOf(store));
  const clock = stepClock();
  const ids = seededIds(clock);
  const plays = scripted(options.plays ?? {});
  const fakes = {
    claude: createFakeRunner({ tribe: 'claude' as never, scenarioOf: plays.scenario }),
    gemini: createFakeRunner({ tribe: 'gemini' as never, scenarioOf: plays.scenario }),
  };
  const runners = {
    claude: judgingRunner(fakes.claude, plays.verdict),
    gemini: judgingRunner(fakes.gemini, plays.verdict),
  };
  const notices: Notice[] = [];
  const warnings: string[] = [];
  const quests = async () => (await store.quests.list()).items.slice();
  return {
    root,
    store,
    clock,
    ids,
    fakes,
    notices,
    warnings,
    morning: () => Promise.resolve(morning),
    steward: (overrides = {}) =>
      createSteward({
        store,
        events: openEventLog(root),
        runners,
        plots: folderPlots(root),
        clock,
        ids,
        bell: { ring: (notice) => Promise.resolve(void notices.push(notice)) },
        log: { warn: (message) => void warnings.push(message) },
        ...overrides,
      }),
    command: async (kind, payload, given) => {
      const id = given ?? ids.ulid();
      const written = await store.inbox.write({
        version: 1,
        id,
        ts: '2026-11-07T09:00:00+07:00',
        kind,
        source: 'cli',
        payload,
      } as unknown as InboxCommandInput);
      if (!written.ok) throw new Error(`fixture: ${written.error.message}`);
      return id;
    },
    quests,
    quest: async (title) => {
      const found = (await quests()).find((quest) => quest.title === title);
      if (found === undefined) throw new Error(`fixture: no quest "${title}"`);
      return found;
    },
    character: async (id) => {
      const read = await store.characters.read(id as never);
      if (!read.ok) throw new Error(`fixture: no character ${id}`);
      return read.value;
    },
    remove: () => rm(root, { recursive: true, force: true }),
  };
}

/** A create_quest payload of `elvaria quest add` (no draft), seal off unless asked. */
export const questPayload = (title: string, fields: Record<string, unknown> = {}) => ({
  draft: false,
  title,
  description: `Fake quest «${title}» of the Steward's specs.`,
  kind: 'build',
  rank: 'D',
  territory: 'dc1-se-team',
  class_required: 'knight',
  tags: ['backend'],
  seal_required: false,
  created_by: 'user',
  ...fields,
});

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Ticks, a minute apart, letting the fake sessions end in between, until `done` holds (or the ticks run out). */
export async function tickUntil(
  steward: Steward,
  clock: StepClock,
  done: () => Promise<boolean>,
  maxTicks = 80,
): Promise<number> {
  for (let tick = 1; tick <= maxTicks; tick += 1) {
    await steward.tick();
    if (await done()) return tick;
    await pause(15);
    clock.advance(1);
  }
  throw new Error(`fixture: not done after ${maxTicks} ticks`);
}
