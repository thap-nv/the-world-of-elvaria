// Who may take work in this tick, and how much room each tribe and territory has left (implementation-plan §3.1,
// §3.14): the bookkeeping planTick shares between its steps, so a character, a tribe slot or a territory slot
// given away in one step is gone for the next ones. A territory has room for a quest when it runs fewer quests than
// its max_concurrent (R1) and the scope rules let the quest start (scope.ts, PS-05: R2, R3). A tribe whose CLI changed
// version since its last passing check opens no session at all (versionHoldsOf, A1b of the lessons of 2026-11-13).
import { poolEnabled, poolKeyOf } from '../mana/pool.ts';
import { admits, asleepFor, manaStateOf } from '../mana/state.ts';
import { RANKS } from '../schema/common.ts';
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
import type { TribeLimits } from '../tribe/tribe-limits.ts';
import type { ToolsFound } from '../tribe/version-hold.ts';
import type { PoolKey } from '../world/mana-view.ts';

/** Statuses in which a character holds a CLI session of its tribe's account (tribe max_concurrent). */
const IN_SESSION: readonly CharacterStatus[] = ['working', 'reviewing', 'meditating'];

export type TerritoryRules = Pick<Territory, 'id' | 'max_concurrent' | 'laws' | 'shared_paths'>;

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

/**
 * The tribes held by their CLI's version (versionHoldsOf). A held tribe still counts and stands by, as an asleep pool
 * does: its wait ends with a passing `tribe check`, not with another character or judge.
 */
const heldTribesOf = (source: RosterSource): ReadonlySet<TribeId> =>
  new Set(versionHoldsOf(source.kingdom.tribes, source.tools_found ?? {}).map(({ tribe }) => tribe));

/** `now` weighs the gauge readings: one whose window has reset no longer counts. */
export function rosterOf(source: RosterSource, now: Instant): Roster {
  const staffed = staffedTribes(source);
  const enabled = new Set(source.kingdom.tribes.filter((tribe) => tribe.enabled).map(({ id }) => id));
  const held = heldTribesOf(source);
  const poolOpen = poolOpenOf(source, now);
  const taken = new Set<CharacterId>();
  const aside = new Set<CharacterId>();
  const inSession = count(
    source.characters.filter(({ status }) => IN_SESSION.includes(status)).map(({ tribe }) => tribe),
  );
  const running = count(source.quests.filter(({ status }) => status === 'working').map((q) => q.territory));
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

  return {
    canStart,
    canWake: (character) => character.status === 'sleeping_mana' && mayOpen(character),
    manaOpen: poolOpen,
    canClaim: (character, quest, territory) => {
      const tribe = staffed.get(character.tribe);
      return tribe !== undefined && canStart(character) && tribeMayTake(tribe.limits, quest, territory);
    },
    counts: (character) =>
      character.status !== 'suspended' && !aside.has(character.id) && enabled.has(character.tribe),
    standsBy: (character) =>
      character.status !== 'suspended' && !aside.has(character.id) && staffed.has(character.tribe),
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
