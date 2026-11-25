// Who may take work in this tick, and how much room each tribe and territory has left (implementation-plan §3.1,
// §3.14): the bookkeeping planTick shares between its steps, so a character, a tribe slot or a territory slot
// given away in one step is gone for the next ones. A territory has room for a quest when it runs fewer quests than
// its max_concurrent (R1) and the scope rules let the quest start (scope.ts, PS-05: R2, R3). A tribe whose CLI changed
// version since its last passing check opens no session at all (versionHoldsOf, A1b of the lessons of 2026-11-13);
// nor does one kept for a session outside the slots: the triage due, an amendment's author awaited (reservedTribesOf).
import { poolEnabled, poolKeyOf } from '../mana/pool.ts';
import { authorOf, awaitsAuthor } from '../memo/amendment.ts';
import { admits, asleepFor, manaStateOf } from '../mana/state.ts';
import { CHANCELLOR_JOBS } from '../schedule/constants.ts';
import { RANKS } from '../schema/common.ts';
import { pickChancellor } from '../tribe/select-chancellor.ts';
import { versionHoldsOf } from '../tribe/version-hold.ts';
import { scopeBookOf } from './scope.ts';
import type { Instant } from '../core/clock.ts';
import type { CharacterId, TerritoryId, TribeId } from '../core/ids.ts';
import type { ManaReading } from '../mana/reading.ts';
import type { SessionShare } from '../mana/session-share.ts';
import type { ManaConfig } from '../mana/state.ts';
import type { Character, CharacterStatus } from '../schema/character/character.ts';
import type { Rank } from '../schema/common.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Territory } from '../schema/territory.ts';
import type { DailyJobId } from '../schedule/constants.ts';
import type { TribeLimits } from '../tribe/tribe-limits.ts';
import type { ToolsFound, TribeHold } from '../tribe/version-hold.ts';
import type { PoolKey } from '../world/mana-view.ts';

/** Statuses in which a character holds a CLI session of its tribe's account (tribe max_concurrent). */
const IN_SESSION: readonly CharacterStatus[] = ['working', 'reviewing', 'meditating'];

/** `delivery` (PS-08c): which done quests go to the territory's forge (forgeDeliveries). */
export type TerritoryRules = Pick<Territory, 'id' | 'max_concurrent' | 'laws' | 'shared_paths' | 'delivery'>;

export interface RosterSource {
  readonly kingdom: Pick<Kingdom, 'tribes'>;
  readonly territories: readonly TerritoryRules[];
  readonly quests: readonly Quest[];
  readonly characters: readonly Character[];
  /** Pools asleep because their mana ran out (ADR 0009). */
  readonly asleep: readonly PoolKey[];
  /**
   * The latest gauge readings and the owner's cap: a pool at the cap opens no session. Absent: only `asleep` stops a
   * pool. With `shares` (P1-48), a pool closes one session before the cap (manaStateOf); without, at the cap.
   */
  readonly mana?: {
    readonly readings: readonly ManaReading[];
    readonly config: ManaConfig;
    readonly shares?: readonly SessionShare[];
  };
  /** What each tribe's runner can do (tribeLimitsOf, §3.14); a tribe with no runner is absent and takes no work. */
  readonly limits: Readonly<Partial<Record<TribeId, TribeLimits>>>;
  /**
   * The CLI each tribe's runner starts, as the Steward found it before the tick (A1b of the lessons of 2026-11-13): a
   * tribe whose CLI is gone or says another than its checked version opens no session (versionHoldsOf). Absent: none
   * is held (a sandbox day, the specs).
   */
  readonly tools_found?: ToolsFound;
  /**
   * The scheduled jobs due today that have not started, as the Steward's scheduler saw them before the plan (dueJobs,
   * fix/acceptance-scope): a job of the Chancellor's among them keeps its tribe from new sessions (reservedTribesOf).
   * (fix/run-221-domain) Only those its next step may start: not one that waits behind another job outside the tick,
   * which would keep the tribe idle for nothing (the (221) run: 13 minutes of patrol). Absent: none (a sandbox day, the
   * specs).
   */
  readonly jobs_due?: readonly DailyJobId[];
}

// Function properties, not methods: planTick passes them to Array.filter on their own.
export interface Roster {
  /** Idle, of a tribe that may work (not held) and has a slot left, its pool open, and not given work yet this tick. */
  readonly canStart: (character: Character) => boolean;
  /** Asleep on a paused quest, its pool open again, its tribe with a slot left (§3.5). */
  readonly canWake: (character: Character) => boolean;
  /**
   * The mana the character draws on opens a session now (poolOpenOf), whatever its status and slots: a quest whose
   * judges all lack it waits for a gauge, not for a judge to be free (judgeWaitOf, PS-03).
   */
  readonly manaOpen: (character: Character) => boolean;
  /** canStart, and the tribe's runner may take this quest on this territory (§3.14). */
  readonly canClaim: (character: Character, quest: Quest, territory: TerritoryRules) => boolean;
  /**
   * May take this quest now or later: stands by, and its tribe's runner may take the quest on this territory. A
   * candidate whose tribe cannot take its prompt waits for such a one (selectAssignee, fix/claim-step).
   */
  readonly mayClaim: (character: Character, quest: Quest, territory: TerritoryRules) => boolean;
  /** Of the quest's roster for claimBlocker: not suspended, of an enabled tribe (busy, asleep or without a runner yet). */
  readonly counts: (character: Character) => boolean;
  /** May judge now or later: not suspended, of an enabled tribe that has a runner (busy or asleep for now). */
  readonly standsBy: (character: Character) => boolean;
  /** The character leaves the roster for this tick without a session (a suspension): no slot is taken. */
  readonly setAside: (character: Character) => void;
  /**
   * The quest's territory exists, has a slot left (territory.max_concurrent, R1), and the scope rules let the quest
   * start there (scopeWaitOf, PS-05: R2, R3), counting the quests started earlier in this tick.
   */
  readonly territoryHasRoom: (quest: Quest) => boolean;
  readonly territory: (id: TerritoryId) => TerritoryRules | undefined;
  /** The character starts a session on `quest` (null: a verifier takes no territory slot, nor any scope). */
  readonly take: (character: Character, quest: Quest | null) => void;
}

/** A quest whose session works in its plot, a healer's included (ADR 0034): territory.max_concurrent counts them. */
const atWork = ({ status }: Quest): boolean => status === 'working' || status === 'healing';

const count = <K>(keys: readonly K[]): Map<K, number> =>
  keys.reduce((map, key) => map.set(key, (map.get(key) ?? 0) + 1), new Map<K, number>());

interface Staffed {
  readonly limits: TribeLimits;
  /** kingdom.tribes[].max_concurrent: sessions the account runs at once. */
  readonly max: number;
}

/**
 * Tribes enabled in kingdom.json whose runner exists and may run, with its limits (ADR 0021): a runner without a
 * headless mode cannot be enabled (§3.14), even when kingdom.json was turned on by hand (P1-19).
 */
function staffedTribes(source: RosterSource): Map<TribeId, Staffed> {
  const staffed = new Map<TribeId, Staffed>();
  for (const { id, enabled, max_concurrent: max } of source.kingdom.tribes) {
    const limits = source.limits[id];
    if (enabled && limits?.enabled === true) staffed.set(id, { limits, max });
  }
  return staffed;
}

const rankAtMost = (rank: Rank, max: Rank): boolean => RANKS.indexOf(rank) <= RANKS.indexOf(max);

/**
 * Whether a tribe with `limits` may be given `quest` (§3.14): no rank above its max_rank, and no quest on a
 * territory with guarded zones unless it has a tool gate. Which files a quest touches is known only after the
 * work, so a territory with any `read_before_write` or `rank_floor` law counts as guarded for all its quests.
 */
export function tribeMayTake(limits: TribeLimits, quest: Quest, territory: TerritoryRules): boolean {
  const guarded = territory.laws.read_before_write.length > 0 || territory.laws.rank_floor.length > 0;
  return rankAtMost(quest.rank, limits.max_rank) && (limits.guarded_zones || !guarded);
}

/**
 * Whether the mana a character draws on opens a session now (§3.5, ADR 0009): its pool enabled, and every gauge
 * that binds its model (its group's windows, its model's own cap; P1-22) awake and below the cap, by one session's
 * share when the Steward measures them (P1-48).
 */
export function poolOpenOf(
  source: Pick<RosterSource, 'kingdom' | 'asleep' | 'mana'>,
  now: Instant,
): (character: Character) => boolean {
  const { tribes } = source.kingdom;
  const readings = source.mana?.readings ?? [];
  return (character) => {
    if (!poolEnabled(tribes, poolKeyOf(tribes, character))) return false;
    if (asleepFor(source.asleep, readings, tribes, character)) return false;
    const { mana } = source;
    return (
      mana === undefined || admits(manaStateOf(readings, tribes, character, mana.config, now, mana.shares))
    );
  };
}

/** Who the quests that wait on their author's decision (awaitsAuthor, PS-22b) wait for: the Chancellor, mages' tribes. */
interface AwaitedAuthors {
  readonly chancellor: boolean;
  readonly tribes: readonly TribeId[];
}

/**
 * The authors the quests blocked on an amendment wait for (authorOf, as the memo was routed): the Chancellor, or the
 * mage of the plan while it is a character of the kingdom and not suspended. A mage gone leaves the quest to the
 * owner (apps/cli `mageOf`), so it keeps no tribe.
 */
function awaitedAuthorsOf(source: Pick<RosterSource, 'quests' | 'characters'>): AwaitedAuthors {
  const waiting = source.quests.filter(awaitsAuthor);
  if (waiting.length === 0) return { chancellor: false, tribes: [] };
  const present = new Map(
    source.characters.filter(({ status }) => status !== 'suspended').map(({ id, tribe }) => [id, tribe]),
  );
  // Every mage counts as present here: one gone is found absent from `present` below.
  const lookup = { quests: new Map(source.quests.map((quest) => [quest.id, quest])), present: () => true };
  const authors = waiting.map((quest) => authorOf(quest, lookup));
  return {
    chancellor: authors.some(({ kind }) => kind === 'chancellor'),
    tribes: authors.flatMap((author) =>
      author.kind === 'mage' ? (present.get(author.character) ?? []) : [],
    ),
  };
}

/**
 * The tribes kept for a session that lies outside the tribes' slots and starts only once no session of its tribe runs
 * (PS-03b), since new work given to the tribe at every tick would starve it all day (fix/acceptance-scope): the
 * Chancellor's while a job of its (CHANCELLOR_JOBS: the triage, and the digest that waits for it) is due, has not
 * started and is next to start (jobs_due, fix/run-221-domain); (fix/amendment-owner-accept, (126)) the author's while a quest waits on its decision (PS-22b), until the
 * decision is applied. The Chancellor is the one the job picks (pickChancellor, as `chancellorOf` of apps/cli does):
 * nobody, or nobody but of a held tribe, keeps no tribe.
 */
function reservedTribesOf(source: RosterSource, holds: readonly TribeHold[]): TribeId[] {
  const awaited = awaitedAuthorsOf(source);
  const triage = (source.jobs_due ?? []).some((job) => CHANCELLOR_JOBS.includes(job));
  if (!triage && !awaited.chancellor) return [...awaited.tribes];
  const pick = pickChancellor(source.characters, source.limits, holds);
  return pick.status === 'chosen' ? [...awaited.tribes, pick.choice.character.tribe] : [...awaited.tribes];
}

/**
 * The tribes that open no session in this tick: those held by their CLI's version (versionHoldsOf), and those kept
 * for the Chancellor or an amendment's author (reservedTribesOf). Either still counts and stands by, as an asleep pool
 * does: its wait ends with a passing `tribe check`, or once the job starts or the decision is in, not with another
 * character or judge.
 */
function closedTribesOf(source: RosterSource): ReadonlySet<TribeId> {
  const holds = versionHoldsOf(source.kingdom.tribes, source.tools_found ?? {});
  return new Set([...holds.map(({ tribe }) => tribe), ...reservedTribesOf(source, holds)]);
}

/** Whether the character's tribe has a runner that may take the quest on the territory (tribeMayTake). */
const tribeTakesOf =
  (staffed: ReadonlyMap<TribeId, Staffed>) =>
  (character: Character, quest: Quest, territory: TerritoryRules): boolean => {
    const tribe = staffed.get(character.tribe);
    return tribe !== undefined && tribeMayTake(tribe.limits, quest, territory);
  };

/** `now` weighs the gauge readings: one whose window has reset no longer counts. */
export function rosterOf(source: RosterSource, now: Instant): Roster {
  const staffed = staffedTribes(source);
  const enabled = new Set(source.kingdom.tribes.filter((tribe) => tribe.enabled).map(({ id }) => id));
  const held = closedTribesOf(source);
  const poolOpen = poolOpenOf(source, now);
  const taken = new Set<CharacterId>();
  const aside = new Set<CharacterId>();
  const inSession = count(
    source.characters.filter(({ status }) => IN_SESSION.includes(status)).map(({ tribe }) => tribe),
  );
  const running = count(source.quests.filter(atWork).map((q) => q.territory));
  const territories = new Map(source.territories.map((territory) => [territory.id, territory]));
  // The scope rules (PS-05), kept up to date with the quests started in this tick.
  const scopes = scopeBookOf(source.quests);
  const roomFor = (quest: Quest): boolean => {
    const territory = territories.get(quest.territory);
    if (territory === undefined || (running.get(territory.id) ?? 0) >= territory.max_concurrent) return false;
    return scopes.waitOf(quest, territory) === null;
  };

  const mayOpen = (character: Character): boolean => {
    const tribe = staffed.get(character.tribe);
    return (
      tribe !== undefined &&
      !held.has(character.tribe) &&
      poolOpen(character) &&
      !taken.has(character.id) &&
      (inSession.get(character.tribe) ?? 0) < tribe.max
    );
  };
  const canStart = (character: Character): boolean => character.status === 'idle' && mayOpen(character);
  const tribeTakes = tribeTakesOf(staffed);
  const standsBy = (character: Character): boolean =>
    character.status !== 'suspended' && !aside.has(character.id) && staffed.has(character.tribe);

  return {
    canStart,
    canWake: (character) => character.status === 'sleeping_mana' && mayOpen(character),
    manaOpen: poolOpen,
    canClaim: (character, quest, territory) => canStart(character) && tribeTakes(character, quest, territory),
    mayClaim: (character, quest, territory) => standsBy(character) && tribeTakes(character, quest, territory),
    counts: (character) =>
      character.status !== 'suspended' && !aside.has(character.id) && enabled.has(character.tribe),
    standsBy,
    setAside: (character) => {
      aside.add(character.id);
      taken.add(character.id);
    },
    territoryHasRoom: roomFor,
    territory: (id) => territories.get(id),
    take: (character, quest) => {
      taken.add(character.id);
      inSession.set(character.tribe, (inSession.get(character.tribe) ?? 0) + 1);
      if (quest === null) return;
      running.set(quest.territory, (running.get(quest.territory) ?? 0) + 1);
      scopes.start(quest);
    },
  };
}

/** Among characters that may take a quest, the one idle the longest goes first (§3.1, the last tie-break). */
export const byIdleSince = (a: Character, b: Character): number =>
  Date.parse(a.status_since) - Date.parse(b.status_since) || a.id.localeCompare(b.id);
