// A throwaway kingdom for the Steward's specs: what `elvaria init` lays out (the default registry, read from
// packages/registry-default by path because the Steward may not depend on it, implementation-plan §1.3), two
// territories, a cast, and FakeRunners for both tribes whose verifiers hand in a verdict.
import { mkdtemp, readdir, rm } from 'node:fs/promises';
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
import type {
  AgentRunner,
  FakeRunner,
  FakeRunnerOptions,
  FakeScenario,
  ProbeOptions,
  ProbeResult,
  SpawnRequest,
  Treasury,
} from '@elvaria/runner-core';
import type { KingdomStore } from '@elvaria/store';

import { folderPlots } from '../plots.ts';
import { createSteward } from '../steward.ts';
import { rememberingHangs, settling } from './settle.ts';
import type { Settling } from './settle.ts';
import type { Notice, Steward, StewardDeps } from '../types.ts';

const REGISTRY_DIR = path.join(import.meta.dirname, '..', '..', '..', 'registry-default');

/**
 * How a spec removes a temp folder: on Windows a child that just ended (git, a check, a killed tree) or the indexer
 * may hold it a moment longer (EBUSY, EPERM), so rm retries, back-off up to 5.5 s, as the conformance workspace of
 * runner-core does (PR #32). Seen under the load of the pre-push hook (P1-39).
 */
export const RM_TEMP = { recursive: true, force: true, maxRetries: 10, retryDelay: 100 } as const;

/** The settling of each Steward a bench made: what tickUntil waits on between two ticks (settle.ts). */
const settlers = new WeakMap<Steward, Settling>();

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
    // The code territory lets its quests ask for the npm token (ADR 0013); the handbook allows none.
    secrets_allowed: kind === 'code' ? ['npm_token'] : [],
  });

/** The treasury value of npm_token in the bench: a shape no pattern knows, so only the known values mask it. */
export const NPM_TOKEN = ['plain', '-FAKE-', 'treasury-value-77'].join('');

/** The minimal env the composition root would hand over: a toolchain path and a home, nothing secret. */
export const BENCH_ENV = { PATH: '/usr/bin', HOME: '/home/owner' } as const;

/** A treasury in memory, with what the file treasury says when a name is missing. */
export const memoryTreasury = (values: Readonly<Record<string, string>>): Treasury => ({
  names: () => Promise.resolve(Object.keys(values).sort()),
  resolve: (names) => {
    const missing = names.filter((name) => values[name] === undefined);
    if (missing.length > 0) return Promise.reject(new Error(`treasury has no ${missing.join(', ')}`));
    return Promise.resolve(Object.fromEntries(names.map((name) => [name, values[name] ?? ''])));
  },
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

/**
 * What a fake verifier hands in: pass unless the plays say otherwise. A pass says what was checked, and names the
 * breaks a judge in a scratch plot owes (P1-40); elsewhere they are kept and weigh nothing.
 */
export const PASS = {
  result: 'pass',
  notes: 'Read the diff and the letter; pnpm test passes, nothing is missing.',
  breaks: [
    { change: 'src/api/orders.ts:42 drops the discount', red: 'pnpm test: orders.spec.ts failed' },
    { change: 'src/api/orders.ts:57 returns 0', red: 'pnpm test: orders.spec.ts failed' },
  ],
};
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
function judgingRunner(
  fake: FakeRunner,
  verdictOf: (req: SpawnRequest) => unknown,
  requests: SpawnRequest[],
): AgentRunner {
  return {
    ...fake,
    spawn: async (req) => {
      requests.push(req);
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
  /** The runners the Steward gets: the fakes, their verifiers handing in verdicts. */
  readonly runners: { readonly claude: AgentRunner; readonly gemini: AgentRunner };
  readonly notices: Notice[];
  readonly warnings: string[];
  /** Every request a runner was asked to spawn, in order. */
  readonly requests: SpawnRequest[];
  /** The morning: the world the files described before the first tick. */
  readonly morning: () => Promise<WorldState>;
  steward(overrides?: Partial<StewardDeps>): Steward;
  /** A FakeRunner of a spec's own, whose `hang` sessions tickUntil knows never to wait for (settle.ts). */
  fake(options: FakeRunnerOptions & { readonly scenarioOf: (req: SpawnRequest) => FakeScenario }): FakeRunner;
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
  /** What each tribe's probe answers (FakeRunner `probe`); ok with no windows by default. */
  readonly probes?: {
    readonly claude?: FakeRunnerOptions['probe'];
    readonly gemini?: FakeRunnerOptions['probe'];
  };
  /** The treasury's contents; npm_token = NPM_TOKEN by default. */
  readonly treasury?: Readonly<Record<string, string>>;
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
  // The five files and the class prompts: a registry without them does not load (P1-15).
  const prompts = (await readdir(path.join(REGISTRY_DIR, 'prompts'))).map((file) => `prompts/${file}`);
  const files = [...REGISTRY_FILES.map((file) => `${file}.json`), ...prompts];
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
  const hangs = new WeakSet<SpawnRequest>();
  const plays = scripted(options.plays ?? {});
  const fakeOf = (tribe: 'claude' | 'gemini') =>
    createFakeRunner({
      tribe: tribe as never,
      scenarioOf: rememberingHangs(hangs, plays.scenario),
      ...(options.probes?.[tribe] === undefined ? {} : { probe: options.probes[tribe] }),
    });
  const fakes = { claude: fakeOf('claude'), gemini: fakeOf('gemini') };
  const requests: SpawnRequest[] = [];
  const runners = {
    claude: judgingRunner(fakes.claude, plays.verdict, requests),
    gemini: judgingRunner(fakes.gemini, plays.verdict, requests),
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
    runners,
    notices,
    warnings,
    requests,
    morning: () => Promise.resolve(morning),
    steward: (overrides = {}) => {
      const settler = settling(hangs);
      const deps: StewardDeps = {
        store,
        events: openEventLog(root),
        runners,
        plots: folderPlots(root),
        env: BENCH_ENV,
        treasury: memoryTreasury(options.treasury ?? { npm_token: NPM_TOKEN }),
        clock,
        ids,
        bell: { ring: (notice) => Promise.resolve(void notices.push(notice)) },
        log: { warn: (message) => void warnings.push(message) },
        ...overrides,
      };
      const made = createSteward({ ...deps, runners: settler.watch(deps.runners) });
      settlers.set(made, settler);
      return made;
    },
    fake: (given) => createFakeRunner({ ...given, scenarioOf: rememberingHangs(hangs, given.scenarioOf) }),
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
    remove: () => rm(root, RM_TEMP),
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

/**
 * Waits, in real time, until the sessions of a bench's Steward and its work outside the tick have ended (or
 * outlived their deadline once, as a hung session does): what a spec does between two ticks before the clock moves.
 */
export const settled = (steward: Steward): Promise<void> =>
  settlers.get(steward)?.settle(steward) ?? steward.idle();

/**
 * Ticks, a minute apart, until `done` holds (or the ticks run out). Between two ticks the fake sessions and the work
 * outside the tick get to end in real time (settled), so a busy machine costs neither fake minutes nor ticks (P1-39).
 */
export async function tickUntil(
  steward: Steward,
  clock: StepClock,
  done: () => Promise<boolean>,
  maxTicks = 80,
): Promise<number> {
  for (let tick = 1; tick <= maxTicks; tick += 1) {
    await steward.tick();
    if (await done()) return tick;
    await settled(steward);
    clock.advance(1);
  }
  throw new Error(`fixture: not done after ${maxTicks} ticks`);
}

/** A probe that finds the account empty `asleep` times before it answers, reads (no ping) always ok. */
export function wakesAfter(asleep: number): (options: ProbeOptions) => ProbeResult {
  let pings = 0;
  return ({ ping = true }) => {
    if (!ping) return { status: 'ok' };
    pings += 1;
    return pings > asleep ? { status: 'ok' } : { status: 'rate_limited', detail: 'still empty' };
  };
}
