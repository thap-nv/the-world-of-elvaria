// "Cần ngài" from the files and the log (P2-04, implementation-plan §3.16.3): the Steward's digest, `elvaria digest` and
// the herald build the owner's attention queue with these functions, so the same files and log give the same list.
// Before, the digest and apps/cli each built the notices (and the Steward kept three waits in memory only, PS-03 (a)).
// What only the running Steward knows stays its caller's to give (NoticeExtras): the branches it found with nothing to
// push, and the newer build apps/cli reads from git.
import { unopenedReviewsOf } from '../breaker/review.ts';
import { sealPolicyOf, sealSuspendedOf } from '../delegation/breaker.ts';
import { deliveringOf, ownerDeliveries } from '../dispatch/forge-polls.ts';
import { scopeHoldsOf } from '../dispatch/scope.ts';
import { narrowEscapeAlertsOf } from '../metrics/check-mode/escapes.ts';
import { baseHoldsOf, baseRedOf } from '../patrol/base-red.ts';
import { baseHealthOf } from '../patrol/health.ts';
import { heldQuestsOf } from '../quest/hold.ts';
import { templeNoticesOf } from '../temple/notices.ts';
import { checkedVersionOf } from '../tribe/version-hold.ts';
import { judgedByEye } from '../verify/ritual-of.ts';
import { attentionQueue } from './attention.ts';
import { scopeWaitNoticesOf } from './attention-scope-wait.ts';
import { forgeOutcomesOf } from './forge-outcome.ts';
import { judgeWaitsOf, tribeHoldsOf, unclaimableOf, waitGaugesOf } from './logged-waits.ts';
import { reduce } from './reduce.ts';
import { unsealedMergesOf } from './unsealed-merges.ts';
import { worldStateOf } from './world-state.ts';
import type { Instant } from '../core/clock.ts';
import type { QuestId } from '../core/ids.ts';
import type { Event } from '../schema/event/event.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Memo } from '../schema/memo/memo.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Verdict } from '../schema/quest/verdict.ts';
import type { Registry } from '../schema/registry.ts';
import type { TribeHold } from '../tribe/version-hold.ts';
import type { AttentionItem } from './attention-table.ts';
import type { StewardNotices, UpgradeOffer } from './attention-notices.ts';
import type { WorldSource, WorldState } from './world-state.ts';

/** The kingdom's files as the store loads them, a file that does not parse left out, and its whole log in order. */
export interface AttentionSource extends Omit<WorldSource, 'campaigns' | 'memos'> {
  readonly memos: readonly Memo[];
  readonly verdicts: readonly Verdict[];
  /** Who judges a kind and who is a Monk (classes), and which rituals ask for eyes (kinds, rituals). */
  readonly registry: Pick<Registry, 'classes' | 'kinds' | 'rituals'>;
  readonly events: readonly Event[];
}

/** What only the caller knows. */
export interface NoticeExtras {
  /** The branches the running Steward found with nothing to push (its forge book): no line of the log says so. */
  readonly nothing?: Iterable<QuestId>;
  /** A newer build to upgrade to (PS-08d): apps/cli asks the pinned build's repo, which no file holds. */
  readonly upgrade?: UpgradeOffer;
}

/** The judging class of a command that summons a judge when no class judges the quest's kind. */
const NO_CLASS = '<class>';

const MANA_LINES: ReadonlySet<string> = new Set(['mana.level', 'mana.exhausted', 'mana.restored']);

/**
 * The world state of the files, with mana as the log says it: the readings and the pools asleep live in the Steward's
 * memory and in the log, not in a file (worldStateOf alone sees every pool awake).
 */
export function worldStateWithManaOf(
  files: Omit<WorldSource, 'campaigns'>,
  events: readonly Event[],
): WorldState {
  const state = worldStateOf({ ...files, campaigns: [] });
  return reduce(
    state,
    events.filter((event) => MANA_LINES.has(event.type)),
  );
}

/** The registry's judging classes of `kind`: who the owner would summon for a quest of it. */
export const judgingClassesOf = (classes: Registry['classes'], kind: Quest['kind']): string[] =>
  classes.filter((entry) => entry.is_verifier && entry.kinds.includes(kind)).map((entry) => entry.id);

/** The quests in review the log says wait for a judge: none in the roster, or every one out of mana. */
function judgeNotices(source: AttentionSource): Pick<StewardNotices, 'unjudgeable' | 'judge_waits'> {
  const byId = new Map(source.quests.map((quest) => [quest.id, quest]));
  const unjudgeable: NonNullable<StewardNotices['unjudgeable']>[number][] = [];
  const waits: NonNullable<StewardNotices['judge_waits']>[number][] = [];
  for (const [id, note] of judgeWaitsOf(source.events)) {
    const quest = byId.get(id);
    if (quest?.status !== 'review') continue;
    const cls = judgingClassesOf(source.registry.classes, quest.kind)[0] ?? NO_CLASS;
    if (note.reason === 'judge_mana') waits.push({ quest: id, class: cls, gauges: waitGaugesOf(note) });
    else unjudgeable.push({ quest: id, class: cls, vision: judgedByEye(quest, source.registry) });
  }
  return { unjudgeable, judge_waits: waits };
}

/** The tribes the log says are held, in kingdom order: enabled, and still held to the version they are checked on. */
const tribesHeldOf = (events: readonly Event[], tribes: Kingdom['tribes']): TribeHold[] => {
  const holds = tribeHoldsOf(events);
  return tribes.flatMap((tribe) => {
    const hold = holds.get(tribe.id);
    if (hold === undefined || !tribe.enabled || checkedVersionOf(tribe) !== hold.checked) return [];
    return [{ tribe: tribe.id, path: hold.path, version: hold.version ?? undefined, checked: hold.checked }];
  });
};

/** The deliveries to the forge, the done quests that hold a scope, and the seal delegation's breaker, from the log. */
function forgeNotices(
  { kingdom, quests, territories, events }: AttentionSource,
  nothing: Iterable<QuestId>,
): Pick<StewardNotices, 'scope_held' | 'deliveries' | 'delegation_suspended'> {
  const outcomes = forgeOutcomesOf(events);
  const suspended = sealSuspendedOf(events);
  const policy = sealPolicyOf(kingdom, suspended);
  // fix/run-221-domain: not a quest the Steward still carries to its base branch, which it archives itself.
  const delivering = deliveringOf(outcomes, quests, territories, { policy, nothing });
  return {
    scope_held: scopeHoldsOf(quests, territories, delivering),
    deliveries: ownerDeliveries(outcomes.values(), quests, territories, policy),
    delegation_suspended: suspended,
  };
}

/** What waits for the owner beyond the world state, from the files and the log, and what only the caller knows. */
export function stewardNoticesOf(
  source: AttentionSource,
  { nothing = [], upgrade }: NoticeExtras = {},
): StewardNotices {
  const { kingdom, quests, territories, events } = source;
  const open = new Set(quests.filter(({ status }) => status === 'open').map(({ id }) => id));
  const patrols = baseHealthOf(events);
  return {
    unclaimable: [...unclaimableOf(events).keys()].filter((id) => open.has(id)),
    ...judgeNotices(source),
    tribes_held: tribesHeldOf(events, kingdom.tribes),
    ...forgeNotices(source, nothing),
    scope_waits: scopeWaitNoticesOf(quests, territories),
    judges_unopened: unopenedReviewsOf(quests),
    patrols,
    // PS-09d: the red territories that take no work, and the open quests that wait for them.
    base_holds: baseHoldsOf(quests, baseRedOf(patrols, territories, quests)),
    held: heldQuestsOf(quests),
    merged_unsealed: unsealedMergesOf(events),
    narrow_escapes: narrowEscapeAlertsOf(events, territories),
    ...templeNoticesOf({
      enabled: kingdom.schedule.temple.enabled,
      classes: source.registry.classes,
      characters: source.characters,
      quests,
      verdicts: source.verdicts,
      memos: source.memos,
      events,
    }),
    ...(upgrade === undefined ? {} : { upgrade }),
  };
}

/** The owner's attention queue at `now` from the files and the log: the digest's list, the herald's `attention`. */
export const attentionOf = (source: AttentionSource, now: Instant, extras?: NoticeExtras): AttentionItem[] =>
  attentionQueue(worldStateWithManaOf(source, source.events), now, stewardNoticesOf(source, extras));
