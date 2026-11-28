// Machine work due that found no slot of dispatch.max_background (LL-03 `room_full`, P1-47): planTick passes the
// checks, scripts, deliveries and guest entries due to startingNow, which keeps those the room has no slot for. The
// same lists are read here again from the snapshot, so whatever is due and did not start waits for the room. A sandbox
// day has no background, so nothing waits for it. A check waiting for a territory's `exclusive` lock does so inside
// its run, outside the snapshot, and is not named.
import { planReviews } from '../dispatch/reviews.ts';
import { rosterOf } from '../dispatch/roster.ts';
import { forgeQueueOf } from '../dispatch/train.ts';
import { heldByBase } from '../patrol/base-red.ts';
import type { Instant } from '../core/clock.ts';
import type { CharacterId } from '../core/ids.ts';
import type { KingdomSnapshot, TickPlan } from '../dispatch/plan-tick.ts';
import type { Character } from '../schema/character/character.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Wait } from './wait.ts';

/** The ready open quests and the done ones, as tickWaitsOf read them. */
export interface RoomQuests {
  readonly open: readonly Quest[];
  readonly done: readonly Quest[];
}

/** The quests in review whose checks planReviews would start, before the room decides. */
function checksDue(snapshot: KingdomSnapshot, now: Instant): Quest[] {
  // Keyed so that a quest's null or absent assignee finds nobody, as planTick's lookup does.
  const byId = new Map<CharacterId | null | undefined, Character>(
    snapshot.characters.map((character) => [character.id, character]),
  );
  const review = snapshot.quests.filter(
    (quest) => quest.status === 'review' && quest.tier === 'session' && typeof quest.verifier !== 'string',
  );
  const characterOf = (id: CharacterId | null | undefined) => byId.get(id);
  const due = new Set(planReviews(snapshot, rosterOf(snapshot, now), characterOf, review, now).checks);
  return review.filter(({ id }) => due.has(id));
}

export function roomWaitsOf(
  snapshot: KingdomSnapshot,
  plan: TickPlan,
  quests: RoomQuests,
  now: Instant,
): Wait[] {
  const { background } = snapshot;
  if (background === undefined) return [];
  const holder = { running: [...background.running] };
  const started = new Set([...plan.checks, ...plan.scripts, ...plan.forge_deliveries]);
  const stopped = heldByBase(snapshot.base_red);
  const scripts = quests.open.filter((quest) => quest.tier === 'script' && !stopped(quest));
  const [deliveries, guests] = forgeQueueOf(snapshot, quests.done, now);
  const delivering = new Set(deliveries);
  const questWaits = [
    ...checksDue(snapshot, now),
    ...scripts,
    ...quests.done.filter(({ id }) => delivering.has(id)),
  ]
    .filter(({ id }) => !started.has(id))
    .map(({ id, territory }): Wait => ({ reason: 'room_full', territory, quest: id, holder }));
  const ran = new Set(plan.guest_runs.map(({ territory, pr }) => `${territory}#${pr}`));
  const guestWaits = guests
    .filter(({ territory, pr }) => !ran.has(`${territory}#${pr}`))
    .map(({ territory, pr }): Wait => ({ reason: 'room_full', territory, pr, holder }));
  return [...questWaits, ...guestWaits];
}
