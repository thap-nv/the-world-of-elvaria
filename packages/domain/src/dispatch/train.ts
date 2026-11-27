// The delivery train of a `deferred` territory (CM-08, ADR 0032, plans/check-modes.md "Tàu giao hàng của `deferred`"):
// a done quest the Steward merges there (boardsTrain) waits on its territory's platform instead of going alone, and the
// train takes the platform's first train.max_quests quests, in the merge queue's order, once one of these holds: the
// owner sent it off, it is full, its first quest waited train.max_wait_minutes, a quest ready to start waits for the
// scope of a quest on it, or nothing works nor is judged on the territory any more. The last two keep a quest of the
// same scope from waiting on the train for more than one run of the checks. The train holds its territory's lane, a
// slot of dispatch.max_background and the kingdom's heavy work (HEAVY_WORK_MAX, with the patrols). A guest entry keeps
// its place: the quests delivered after it came wait for it. The platform is drawn from the snapshot, no file of its own.
import { MS_PER_MINUTE } from '../constants.ts';
import { HEAVY_WORK_MAX } from '../patrol/constants.ts';
import { questFinished } from '../quest/finished.ts';
import { checkPolicyOf } from '../schema/territory-check-policy.ts';
import { boardsOf, busyOf, forgeDeliveries, guestRunsOf, pendingOf, queueOrder } from './forge-due.ts';
import { aheadOfGuest, firstGuestsOf } from './guests.ts';
import { SCOPE_WAITING_STATUSES, scopeBookOf } from './scope.ts';
import type { Instant } from '../core/clock.ts';
import type { QuestId, TerritoryId } from '../core/ids.ts';
import type { TrainDeparture } from '../schema/event/train-data.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { ForgeSource } from './forge-due.ts';

/** What the train's departure reads beyond the merge queue's source. */
export interface TrainSource extends ForgeSource {
  readonly quests: readonly Quest[];
}

/** A train that leaves now: its territory, why, and its quests in the order the Steward merges them. */
export interface TrainRun {
  readonly territory: TerritoryId;
  readonly departure: TrainDeparture;
  readonly quests: readonly QuestId[];
}

/** Statuses of a quest that still works or is judged on its territory: the train waits for it while it may. */
const AT_WORK: readonly Quest['status'][] = ['claimed', 'working', 'healing', 'review'];

type Platformed = TrainSource['territories'][number];

/** Whether a quest of the territory, ready to start, waits for the scope of a quest on the platform (R3). */
function heldByPlatform(source: TrainSource, territory: Platformed, platform: readonly Quest[]): boolean {
  const book = scopeBookOf(source.quests);
  const finished = new Set(source.quests.filter(questFinished).map(({ id }) => id));
  const on = new Set(platform.map(({ id }) => id));
  return source.quests.some((quest) => {
    if (quest.territory !== territory.id || !SCOPE_WAITING_STATUSES.includes(quest.status)) return false;
    if (!quest.depends_on.every((id) => finished.has(id))) return false;
    const holder = book.waitOf(quest, territory)?.holder;
    return holder !== undefined && on.has(holder);
  });
}

/** Why the train of `territory` leaves now, or undefined while it waits. */
function departureOf(
  source: TrainSource,
  territory: Platformed,
  platform: readonly Quest[],
  now: Instant,
): TrainDeparture | undefined {
  const { train } = checkPolicyOf(territory);
  if (source.train_orders?.includes(territory.id) === true) return 'owner';
  if (platform.length >= train.max_quests) return 'full';
  // A quest on the platform was delivered (forgeDue): its delivered_at is there.
  const waited = platform.map(({ deliverable }) => now - Date.parse(String(deliverable.delivered_at)));
  if (Math.max(...waited) >= train.max_wait_minutes * MS_PER_MINUTE) return 'waited';
  if (heldByPlatform(source, territory, platform)) return 'scope';
  const atWork = source.quests.some(
    (quest) => quest.territory === territory.id && AT_WORK.includes(quest.status),
  );
  return atWork ? undefined : 'idle';
}

/** The quests on each territory's platform, in the queue's order; those delivered after a waiting guest wait for it. */
function platformsOf(source: TrainSource, done: readonly Quest[]): Map<TerritoryId, Quest[]> {
  const stale = new Set(source.forge_stale);
  const sizes = new Map((source.forge_sizes ?? []).map((size) => [size.quest, size]));
  const guests = firstGuestsOf(source.guests);
  const boards = boardsOf(source);
  const platforms = new Map<TerritoryId, Quest[]>();
  for (const quest of pendingOf(source, done).filter(boards).toSorted(queueOrder(sizes, stale))) {
    const guest = guests.get(quest.territory);
    if (guest !== undefined && !aheadOfGuest(quest, guest)) continue;
    platforms.set(quest.territory, [...(platforms.get(quest.territory) ?? []), quest]);
  }
  return platforms;
}

/**
 * The trains that leave now, by territory id, at most what HEAVY_WORK_MAX leaves beside the heavy work running: none
 * on a territory whose lane is held, or whose quest goes alone in this tick. Whether each starts now is the room's.
 */
export function trainRunsOf(source: TrainSource, done: readonly Quest[], now: Instant): TrainRun[] {
  const heavy = (source.background?.patrols ?? 0) + (source.background?.trains?.length ?? 0);
  const busy = busyOf(source, done, new Set(source.forge_stale));
  const alone = new Set(forgeDeliveries(source, done));
  for (const quest of done) if (alone.has(quest.id)) busy.add(quest.territory);
  const platforms = platformsOf(source, done);
  const runs: TrainRun[] = [];
  for (const territory of source.territories.toSorted((a, b) => a.id.localeCompare(b.id))) {
    const platform = platforms.get(territory.id);
    if (platform === undefined || busy.has(territory.id) || heavy + runs.length >= HEAVY_WORK_MAX) continue;
    const departure = departureOf(source, territory, platform, now);
    const { max_quests } = checkPolicyOf(territory).train;
    if (departure !== undefined)
      runs.push({
        territory: territory.id,
        departure,
        quests: platform.slice(0, max_quests).map(({ id }) => id),
      });
  }
  return runs;
}

/** The merge queue's deliveries due, its guests that may start and (CM-08) its trains that leave: the room decides. */
export const forgeQueueOf = (source: TrainSource, done: readonly Quest[], now: Instant) =>
  [forgeDeliveries(source, done), guestRunsOf(source, done), trainRunsOf(source, done, now)] as const;
