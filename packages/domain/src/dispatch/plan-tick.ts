// planTick(snapshot, now): what the Steward does in one tick, decided as a pure function of a snapshot of the
// kingdom (implementation-plan §3.1, ADR 0002); the Steward and the sandbox only carry the plan out. This is the
// minimal form P0-10 needs: step 6, claims. An open quest whose dependencies are done goes to a free character
// of its class and level, of an enabled tribe that is awake; a script-tier quest goes to the Steward itself.
// P1-03 extends it with the other steps (verifications, redispatches, breakers, wakes, deliveries), the limits
// (tribe and territory max_concurrent, exclusive checks), round-robin over territories and ranking by affinity.
import { canTake } from '../character/level.ts';
import { RANKS } from '../schema/common.ts';
import type { Instant } from '../core/clock.ts';
import type { CharacterId, QuestId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { PoolKey } from '../world/mana-view.ts';

export interface KingdomSnapshot {
  /** Which tribes may take work (P1-03 reads the rest of kingdom.json: limits, dispatch, breakers). */
  readonly kingdom: Pick<Kingdom, 'tribes'>;
  readonly quests: readonly Quest[];
  readonly characters: readonly Character[];
  /** Pools that sleep because their mana ran out (ADR 0009); P1-05 adds the pools closed at the cap. */
  readonly asleep: readonly PoolKey[];
}

/** A session-tier quest and the character that takes it, with its level for the claim event (§2.6). */
export interface Claim {
  readonly quest: QuestId;
  readonly assignee: CharacterId;
  readonly level: number;
}

export interface TickPlan {
  /** In the order the Steward applies them: highest rank first, then the oldest quest. */
  readonly claims: readonly Claim[];
  /** Script-tier quests the Steward claims with no assignee and runs itself (§3.12), in the same order. */
  readonly scripts: readonly QuestId[];
}

const rankOrder = (quest: Quest): number => RANKS.indexOf(quest.rank);

/** Step 6 (§3.1): (b) higher rank first, (c) older first; the id keeps the order total. */
const byPriority = (a: Quest, b: Quest): number =>
  rankOrder(b) - rankOrder(a) ||
  Date.parse(a.created_at) - Date.parse(b.created_at) ||
  a.id.localeCompare(b.id);

/** Among characters that may take a quest, the one idle the longest goes first (§3.1, the last tie-break). */
const byIdleSince = (a: Character, b: Character): number =>
  Date.parse(a.status_since) - Date.parse(b.status_since) || a.id.localeCompare(b.id);

/**
 * A tribe sleeps while any of its pools sleeps. Conservative until poolOf (P1-05) tells which pool a character's
 * model draws on: a character is never sent into a pool that has run out.
 */
function freeCharacters(snapshot: KingdomSnapshot): Character[] {
  const enabled = new Set(snapshot.kingdom.tribes.filter((tribe) => tribe.enabled).map(({ id }) => id));
  const asleep = new Set(snapshot.asleep.map(({ tribe }) => tribe));
  return snapshot.characters
    .filter(({ status, tribe }) => status === 'idle' && enabled.has(tribe) && !asleep.has(tribe))
    .toSorted(byIdleSince);
}

/**
 * The character that takes `quest`: one of its class within its level's ceiling, else one rank above the ceiling
 * because nobody else of the class is free (canTake, §2.6; the claim then makes the quest wait for the seal).
 */
function takerOf(quest: Quest, free: readonly Character[]): Character | undefined {
  const ofClass = free.filter((character) => character.class === quest.class_required);
  const within = ofClass.find((character) => canTake(character.level, quest.rank, false));
  return within ?? ofClass.find((character) => canTake(character.level, quest.rank, true));
}

/** The claims of this tick. `now` is for the steps P1-03 adds (breakers, probes, waits); claims do not need it. */
export function planTick(snapshot: KingdomSnapshot, _now: Instant): TickPlan {
  const done = new Set(snapshot.quests.filter(({ status }) => status === 'done').map(({ id }) => id));
  const ready = snapshot.quests
    .filter(({ status, depends_on }) => status === 'open' && depends_on.every((id) => done.has(id)))
    .toSorted(byPriority);
  let free = freeCharacters(snapshot);
  const claims: Claim[] = [];
  for (const quest of ready.filter(({ tier }) => tier === 'session')) {
    const taker = takerOf(quest, free);
    if (taker === undefined) continue;
    claims.push({ quest: quest.id, assignee: taker.id, level: taker.level });
    free = free.filter(({ id }) => id !== taker.id);
  }
  const scripts = ready.filter(({ tier }) => tier === 'script').map(({ id }) => id);
  return { claims, scripts };
}
