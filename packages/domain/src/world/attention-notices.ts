// The items of the owner's attention queue (attention.ts) that come from what the Steward knows and no file holds, its
// notices (StewardNotices), and the helpers every item is made with. Out of attention.ts, which builds the queue, to keep
// both under the size limit (PS-09d, the coordinator's plan: split it before adding a kind).
import { ATTENTION_TABLE } from './attention-table.ts';
import { revertWordsOf } from './unsealed-merges.ts';
import type { UnopenedReview } from '../breaker/review.ts';
import type { QuestId } from '../core/ids.ts';
import type { SealSuspension } from '../delegation/breaker.ts';
import type { WaitGauge } from '../dispatch/judge-waits.ts';
import type { ScopeHold } from '../dispatch/scope.ts';
import type { BaseHold } from '../patrol/base-red.ts';
import type { TerritoryHealth } from '../patrol/health.ts';
import type { HeldQuest } from '../quest/hold.ts';
import type { StreakWait, TempleWaiting } from '../temple/waiting.ts';
import type { TribeHold } from '../tribe/version-hold.ts';
import type { ForgeOutcome } from './forge-outcome.ts';
import type { QuestView } from './quest-view.ts';
import type { ScopeWaitNotice } from './attention-scope-wait.ts';
import type { UnsealedMerge } from './unsealed-merges.ts';
import type { WorldState } from './world-state.ts';
import type { AttentionItem, AttentionKind, AttentionSubject } from './attention-table.ts';

/** What the Steward knows that the world state does not: its notices, kept in its memory or in `.state/`. */
export interface StewardNotices {
  /** Open quests nobody can take (`quest.unclaimable`, `.state/unclaimable.json`). */
  readonly unclaimable?: readonly QuestId[];
  /**
   * Quests in review whose judge the roster does not have (P1-15), with a judging class of their kind; `vision` when the
   * quest needs a judge whose tribe reads images (judgedByEye, PS-11).
   */
  readonly unjudgeable?: readonly {
    readonly quest: QuestId;
    readonly class: string;
    readonly vision?: boolean;
  }[];
  /** Quests whose judges' mana is all closed (PS-03), with the pools that hold them. */
  readonly judge_waits?: readonly {
    readonly quest: QuestId;
    readonly class: string;
    readonly gauges: readonly WaitGauge[];
  }[];
  /** Done quests that still hold a scope quests wait for (scopeHoldsOf, PS-05); from the quest files, not the Steward's. */
  readonly scope_held?: readonly ScopeHold[];
  /** Open quests that wait for a quest whose scope meets theirs (scopeWaitNoticesOf); from the quest files too. */
  readonly scope_waits?: readonly ScopeWaitNotice[];
  /** Quests in review whose latest judge could not open a session (unopenedReviewsOf); from the quest files too. */
  readonly judges_unopened?: readonly UnopenedReview[];
  /** Tribes whose CLI says another version than their checked one (versionHoldsOf), as the Steward last found them. */
  readonly tribes_held?: readonly TribeHold[];
  /** The latest outcome of each quest's delivery to its forge (forgeOutcomesOf, PS-08c); from the log. */
  readonly deliveries?: readonly ForgeOutcome[];
  /** The health of each patrolled territory's default branch (baseHealthOf, PS-26); from the log. */
  readonly patrols?: readonly TerritoryHealth[];
  /**
   * (PS-09d) The red territories that take no work now (baseHoldsOf over baseRedOf), with the open quests that wait for
   * their branch to be green: their `base_red` items say so. From the log and the quest files.
   */
  readonly base_holds?: readonly BaseHold[];
  /** The quests the owner holds ((D) of fix/quest-hold, heldQuestsOf); from the quest files, not the Steward's. */
  readonly held?: readonly HeldQuest[];
  /** A newer build to upgrade to (PS-08d): apps/cli reads it from the pinned build's repo as the digest is made. */
  readonly upgrade?: UpgradeOffer;
  /** (PS-08b) The merges without the seal since the last digest (unsealedMergesOf); from the log as it is made. */
  readonly merged_unsealed?: readonly UnsealedMerge[];
  /** (PS-08g) The territories whose delegation of the seal the breaker suspended (sealSuspendedOf); from the log. */
  readonly delegation_suspended?: readonly SealSuspension[];
  /** (PS-12g) The characters suspended for a fail streak that the Temple did not free (streakWaitsOf); from the log. */
  readonly streak_suspended?: readonly StreakWait[];
  /** (PS-12g) The repeated failures that wait while the Temple cannot run (templeWaitingOf). */
  readonly temple_waiting?: TempleWaiting;
}

/** The pinned commit, the default branch's commit, and how many commits since touch `packages/` or `apps/`. */
export interface UpgradeOffer {
  readonly pinned: string;
  readonly latest: string;
  readonly commits: number;
}

const FIELD = /^\{(\w+)\}$/;

export function itemOf(kind: AttentionKind, subject: AttentionSubject): AttentionItem {
  const { group, advice, command } = ATTENTION_TABLE[kind];
  const fields = new Map(Object.entries(subject));
  const words = command.map((word) => {
    const field = FIELD.exec(word)?.[1];
    return field === undefined ? word : String(fields.get(field));
  });
  return { kind, group, advice, command: words, ...subject };
}

export const aboutQuest = (quest: QuestView): AttentionSubject => ({
  quest: quest.id,
  title: quest.title,
  rank: quest.rank,
});

/** The quest of the state, or its id alone when the state no longer holds it. */
const aboutId = (state: WorldState, id: QuestId): AttentionSubject => {
  const quest = state.quests[id];
  return quest === undefined ? { quest: id } : aboutQuest(quest);
};

/**
 * A merge quest still on its way (PS-09b): in the world (an archived quest has left it), or merged by the Steward,
 * which archives the quest it stands for at the same tick.
 */
const merging = (state: WorldState, merged: ReadonlySet<QuestId>, id: QuestId | undefined): id is QuestId =>
  id !== undefined && (state.quests[id] !== undefined || merged.has(id));

/**
 * A done quest's delivery: stopped (the owner asks again with `deliver`), or its pull request open for the owner. A
 * quest no longer done (archived) has nothing left to do there; a merged one neither. (PS-09b) One whose stop opened
 * a merge quest waits for it, nothing for the owner to do; once that quest is dropped, the stop is the owner's again.
 */
function deliveryItems(
  state: WorldState,
  outcome: ForgeOutcome,
  merged: ReadonlySet<QuestId>,
): AttentionItem[] {
  const quest = state.quests[outcome.data.quest];
  if (quest?.status !== 'done') return [];
  if (outcome.type === 'delivery.pushed')
    return [itemOf('delivery_waits', { ...aboutQuest(quest), url: outcome.data.pr.url })];
  if (outcome.type === 'delivery.merged') return [];
  const { stage, reason, pr, merge_quest: merge } = outcome.data;
  if (merging(state, merged, merge))
    return [itemOf('delivery_merging', { ...aboutQuest(quest), stage, reason, merge_quest: merge })];
  return [
    itemOf('delivery_failed', {
      ...aboutQuest(quest),
      stage,
      reason,
      ...(pr === undefined ? {} : { url: pr.url }),
    }),
  ];
}

/**
 * A territory's red checks, then its scans that did not pass (PS-26); (PS-09d) a red check of a territory that takes no
 * work names the quests that wait for it (`waiting`, maybe none).
 */
function patrolItems(
  { territory, red, scans }: TerritoryHealth,
  holds: readonly BaseHold[],
): AttentionItem[] {
  const hold = holds.find((held) => held.territory === territory);
  return [
    ...red.map((check) =>
      itemOf('base_red', {
        territory,
        check: check.check,
        ...(check.error_line === undefined ? {} : { error_line: check.error_line }),
        log_path: check.log_path,
        ...(check.commit === null ? {} : { commit: check.commit }),
        since: check.since,
        suspects: check.suspects.map(({ quest }) => quest),
        ...(hold === undefined ? {} : { waiting: hold.waiting }),
      }),
    ),
    ...scans.map(({ script, outcome, count }) =>
      itemOf('patrol_scan', { territory, script, outcome, ...(count === undefined ? {} : { count }) }),
    ),
  ];
}

/** Each delivery's item; `merged`: the quests whose pull request the Steward merged (PS-09b, merging). */
function deliveriesOf(state: WorldState, deliveries: readonly ForgeOutcome[] = []): AttentionItem[] {
  const merged = new Set(
    deliveries.flatMap(({ type, data }) => (type === 'delivery.merged' ? [data.quest] : [])),
  );
  return deliveries.flatMap((outcome) => deliveryItems(state, outcome, merged));
}

/** A territory whose delegation the breaker suspended: why, since when, and the quest it blames. */
const suspensionItem =
  (state: WorldState) =>
  ({ territory, quest, cause, check, note, since }: SealSuspension): AttentionItem =>
    itemOf('delegation_suspended', {
      ...aboutId(state, quest),
      territory,
      cause,
      since,
      ...(check === undefined ? {} : { check }),
      ...(note === undefined ? {} : { note }),
    });

/**
 * (PS-12g) What waits on the Temple: each character suspended for a fail streak, with the Monk's letters; and one item
 * for the repeated failures, that adds a Monk when none can run, else turns the Temple on.
 */
function templeItems(notices: StewardNotices): AttentionItem[] {
  const waiting = notices.temple_waiting;
  return [
    ...(notices.streak_suspended ?? []).map(({ character, fail_kind: kind, count, letters }) =>
      itemOf('character_suspended', {
        character,
        ...(kind === null ? {} : { fail_kind: kind }),
        count,
        letters,
      }),
    ),
    ...(waiting === undefined
      ? []
      : [
          itemOf(waiting.reasons.includes('no_monk') ? 'temple_no_monk' : 'temple_off', {
            count: waiting.groups,
            temple_reasons: waiting.reasons,
            class: waiting.class ?? '<class>',
          }),
        ]),
  ];
}

export function noticeItems(state: WorldState, notices: StewardNotices): AttentionItem[] {
  return [
    ...(notices.unclaimable ?? []).map((id) => itemOf('unclaimable', aboutId(state, id))),
    ...(notices.unjudgeable ?? []).map(({ quest, class: cls, vision }) =>
      itemOf(vision === true ? 'unjudgeable_vision' : 'unjudgeable', {
        ...aboutId(state, quest),
        class: cls,
      }),
    ),
    ...(notices.judge_waits ?? []).map(({ quest, class: cls, gauges }) =>
      itemOf('judge_mana', { ...aboutId(state, quest), class: cls, gauges }),
    ),
    ...(notices.judges_unopened ?? []).map(({ quest, judge }) =>
      itemOf('judge_no_session', { ...aboutId(state, quest), judge }),
    ),
    ...(notices.scope_held ?? []).map(({ quest, waiting }) =>
      itemOf('scope_held', { ...aboutId(state, quest), waiting }),
    ),
    ...(notices.scope_waits ?? []).map(({ quest, holder, overlap }) =>
      itemOf('scope_wait', { ...aboutId(state, quest), holder, overlap }),
    ),
    ...deliveriesOf(state, notices.deliveries),
    ...(notices.merged_unsealed ?? []).map((merge) =>
      itemOf('merged_unsealed', {
        ...aboutId(state, merge.quest),
        territory: merge.territory,
        url: merge.url,
        commit: merge.merge_sha,
        revert: revertWordsOf(merge),
      }),
    ),
    ...(notices.delegation_suspended ?? []).map(suspensionItem(state)),
    ...templeItems(notices),
    ...(notices.held ?? []).map(({ quest, reason }) =>
      itemOf('quest_held', {
        ...aboutId(state, quest),
        ...(reason === undefined ? {} : { held_reason: reason }),
      }),
    ),
    ...(notices.patrols ?? []).flatMap((health) => patrolItems(health, notices.base_holds ?? [])),
    ...(notices.tribes_held ?? []).map(({ tribe, path, version, checked }) =>
      version === undefined
        ? itemOf('tribe_gone', { tribe, path, checked_version: checked })
        : itemOf('tribe_held', { tribe, path, version, checked_version: checked }),
    ),
    ...(notices.upgrade === undefined ? [] : [itemOf('upgrade_available', { ...notices.upgrade })]),
  ];
}
