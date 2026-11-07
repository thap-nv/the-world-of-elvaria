// Who may take work in this tick, and how much room each tribe and territory has left (implementation-plan §3.1,
// §3.14): the bookkeeping planTick shares between its steps, so a character, a tribe slot or a territory slot
// given away in one step is gone for the next ones.
import { RANKS } from '../schema/common.ts';
import type { CharacterId, TerritoryId, TribeId } from '../core/ids.ts';
import type { Character, CharacterStatus } from '../schema/character/character.ts';
import type { Rank } from '../schema/common.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Territory } from '../schema/territory.ts';
import type { TribeLimits } from '../tribe/tribe-limits.ts';
import type { PoolKey } from '../world/mana-view.ts';

/** Statuses in which a character holds a CLI session of its tribe's account (tribe max_concurrent). */
const IN_SESSION: readonly CharacterStatus[] = ['working', 'reviewing', 'meditating'];

export type TerritoryRules = Pick<Territory, 'id' | 'max_concurrent' | 'laws'>;

export interface RosterSource {
  readonly kingdom: Pick<Kingdom, 'tribes'>;
  readonly territories: readonly TerritoryRules[];
  readonly quests: readonly Quest[];
  readonly characters: readonly Character[];
  /** Pools asleep because their mana ran out (ADR 0009). */
  readonly asleep: readonly PoolKey[];
  /** What each tribe's runner can do (tribeLimitsOf, §3.14); a tribe with no runner is absent and takes no work. */
  readonly limits: Readonly<Partial<Record<TribeId, TribeLimits>>>;
}

// Function properties, not methods: planTick passes them to Array.filter on their own.
export interface Roster {
  /** Idle, of a tribe that may work and has a slot left, and not given work yet this tick. */
  readonly canStart: (character: Character) => boolean;
  /** canStart, and the tribe's runner may take this quest on this territory (§3.14). */
  readonly canClaim: (character: Character, quest: Quest, territory: TerritoryRules) => boolean;
  /** Of the quest's roster for claimBlocker: not suspended, of an enabled tribe (busy, asleep or without a runner yet). */
  readonly counts: (character: Character) => boolean;
  /** The territory exists and has a slot left (territory.max_concurrent). */
  readonly territoryHasRoom: (territory: TerritoryId) => boolean;
  readonly territory: (id: TerritoryId) => TerritoryRules | undefined;
  /** The character starts a session, on a quest of `territory` (null: a verifier takes no territory slot). */
  readonly take: (character: Character, territory: TerritoryId | null) => void;
}

const count = <K>(keys: readonly K[]): Map<K, number> =>
  keys.reduce((map, key) => map.set(key, (map.get(key) ?? 0) + 1), new Map<K, number>());

interface Staffed {
  readonly limits: TribeLimits;
  /** kingdom.tribes[].max_concurrent: sessions the account runs at once. */
  readonly max: number;
}

/** Tribes enabled in kingdom.json whose runner exists, with its limits (ADR 0021). */
function staffedTribes(source: RosterSource): Map<TribeId, Staffed> {
  const staffed = new Map<TribeId, Staffed>();
  for (const { id, enabled, max_concurrent: max } of source.kingdom.tribes) {
    const limits = source.limits[id];
    if (enabled && limits !== undefined) staffed.set(id, { limits, max });
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

export function rosterOf(source: RosterSource): Roster {
  const staffed = staffedTribes(source);
  const enabled = new Set(source.kingdom.tribes.filter((tribe) => tribe.enabled).map(({ id }) => id));
  // A tribe sleeps while any of its pools sleeps, until poolOf (P1-05) tells which pool a character draws on.
  const asleep = new Set(source.asleep.map(({ tribe }) => tribe));
  const taken = new Set<CharacterId>();
  const inSession = count(
    source.characters.filter(({ status }) => IN_SESSION.includes(status)).map(({ tribe }) => tribe),
  );
  const running = count(source.quests.filter(({ status }) => status === 'working').map((q) => q.territory));
  const territories = new Map(source.territories.map((territory) => [territory.id, territory]));

  const canStart = (character: Character): boolean => {
    const tribe = staffed.get(character.tribe);
    return (
      tribe !== undefined &&
      character.status === 'idle' &&
      !asleep.has(character.tribe) &&
      !taken.has(character.id) &&
      (inSession.get(character.tribe) ?? 0) < tribe.max
    );
  };

  return {
    canStart,
    canClaim: (character, quest, territory) => {
      const tribe = staffed.get(character.tribe);
      return tribe !== undefined && canStart(character) && tribeMayTake(tribe.limits, quest, territory);
    },
    counts: (character) => character.status !== 'suspended' && enabled.has(character.tribe),
    territoryHasRoom: (id) => (running.get(id) ?? 0) < (territories.get(id)?.max_concurrent ?? 0),
    territory: (id) => territories.get(id),
    take: (character, territory) => {
      taken.add(character.id);
      inSession.set(character.tribe, (inSession.get(character.tribe) ?? 0) + 1);
      if (territory !== null) running.set(territory, (running.get(territory) ?? 0) + 1);
    },
  };
}

/** Among characters that may take a quest, the one idle the longest goes first (§3.1, the last tie-break). */
export const byIdleSince = (a: Character, b: Character): number =>
  Date.parse(a.status_since) - Date.parse(b.status_since) || a.id.localeCompare(b.id);
