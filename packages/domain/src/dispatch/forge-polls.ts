// When the Steward asks the forge about a sealed quest's pull request under `pr_merge` (implementation-plan §3.16.7,
// ADR 0023; PS-08d): after its `delivery.pushed`, every FORGE_POLL_SECONDS, each question a short piece of work
// outside the tick (steward forge/merge.ts) that merges the pull request once the forge says it can. Short pieces
// rather than one long wait: a Steward that stops loses only the question in flight, and the time limit counts from
// the push, which the log dates, so a restart does not give the checks a new hour.
import { FORGE_POLL_SECONDS, MS_PER_MINUTE, MS_PER_SECOND } from '../constants.ts';
import { deliveryOf } from '../schema/territory-delivery.ts';
import { mergeDue } from './forge-due.ts';
import type { Instant } from '../core/clock.ts';
import type { QuestId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { ForgeOutcome } from '../world/forge-outcome.ts';
import type { ForgeSource } from './forge-due.ts';

/** A done quest whose latest outcome is `delivery.pushed`, as the Steward keeps it. */
export interface ForgeWait {
  readonly quest: QuestId;
  /** When its `delivery.pushed` was written: `checks_timeout_minutes` counts from there. */
  readonly since: Instant;
  /** When the Steward last asked the forge about it; absent: not yet. */
  readonly asked?: Instant;
}

/** One question to the forge. */
export interface ForgePoll {
  readonly quest: QuestId;
  /** The checks had their `checks_timeout_minutes`: still pending now, the delivery stops (`checks_timeout`). */
  readonly timed_out: boolean;
}

export interface ForgePollSource extends ForgeSource {
  /** Done quests whose pull request is open, the Steward's last word about them `delivery.pushed`. Absent: none. */
  readonly forge_waits?: readonly ForgeWait[];
}

/**
 * The pull requests to ask about now: sealed quests under `pr_merge` (mergeDue), none whose work still runs, none the
 * merge queue updates again (PS-09: its branch no longer merges cleanly, its next push asks anew).
 */
export function forgePolls(source: ForgePollSource, done: readonly Quest[], now: Instant): ForgePoll[] {
  const waits = new Map((source.forge_waits ?? []).map((wait) => [wait.quest, wait]));
  const running = new Set([...(source.background?.running ?? []), ...(source.forge_stale ?? [])]);
  const territories = new Map(source.territories.map((territory) => [territory.id, territory]));
  return done.flatMap((quest) => {
    const wait = waits.get(quest.id);
    const territory = territories.get(quest.territory);
    if (wait === undefined || territory === undefined || running.has(quest.id)) return [];
    if (!mergeDue(quest, territory)) return [];
    if (wait.asked !== undefined && now - wait.asked < FORGE_POLL_SECONDS * MS_PER_SECOND) return [];
    const limit = deliveryOf(territory).checks_timeout_minutes * MS_PER_MINUTE;
    return [{ quest: quest.id, timed_out: now - wait.since >= limit }];
  });
}

/**
 * The outcomes the digest names (`deliveries`): a pull request the Steward merges itself (mergeDue) waits for nobody,
 * so its `delivery.pushed` says nothing to the owner; what it ends in (merged, failed) does.
 */
export function ownerDeliveries(
  outcomes: Iterable<ForgeOutcome>,
  quests: readonly Quest[],
  territories: ForgeSource['territories'],
): ForgeOutcome[] {
  const byId = new Map(quests.map((quest) => [quest.id, quest]));
  const where = new Map(territories.map((territory) => [territory.id, territory]));
  return [...outcomes].filter(({ type, data }) => {
    const quest = byId.get(data.quest);
    if (type !== 'delivery.pushed' || quest === undefined) return true;
    return !mergeDue(quest, where.get(quest.territory));
  });
}
