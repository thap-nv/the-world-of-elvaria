// attentionQueue(state): everything that waits for the owner (implementation-plan §3.16.3, PS-03; glossary
// "attention"), as the digest, and later the world and the lite client, list it. Pure, from the world state and what
// the Steward knows that no file holds (its notices); each item has its group (the work waits on it, or it can wait),
// an advice code and the `elvaria` command that acts on it, both looked up in ATTENTION_TABLE by the item's kind.
// (PS-05) A done quest that still holds the scope other quests wait for comes from the caller too (scopeHoldsOf): the
// world state does not hold the quests' scopes. (PS-22) An open memo is an item by where it went: an objection on its way
// to a second judge waits for nobody, one no judge may read (MEMO_ROUTES `owner`) is the owner's to settle. A tribe the
// Steward holds because its CLI changed version (versionHoldsOf, A1b of the lessons of 2026-11-13) comes from its notices.
// A review whose latest judge could not open a session comes from the quest files (unopenedReviewsOf,
// fix/review-no-session). A done quest whose delivery to its forge stopped, or whose pull request waits for the owner,
// comes from the log (forgeOutcomesOf, PS-08c).
import { current } from '../mana/reading.ts';
import { manaWarningOf } from '../mana/state.ts';
import { RANKS } from '../schema/common.ts';
import { ATTENTION_GROUPS, ATTENTION_KINDS, ATTENTION_TABLE } from './attention-table.ts';
import type { UnopenedReview } from '../breaker/review.ts';
import type { Instant } from '../core/clock.ts';
import type { QuestId } from '../core/ids.ts';
import type { WaitGauge } from '../dispatch/judge-waits.ts';
import type { ScopeHold } from '../dispatch/scope.ts';
import { AMENDMENT_REFUSALS } from '../schema/memo/constants.ts';
import type { MemoRoute } from '../schema/memo/memo.ts';
import type { TribeHold } from '../tribe/version-hold.ts';
import type { MemoView } from './memo-view.ts';
import type { PoolView } from './mana-view.ts';
import type { QuestView } from './quest-view.ts';
import type { WorldState } from './world-state.ts';
import type { ForgeOutcome } from './forge-outcome.ts';
import type { AttentionItem, AttentionKind, AttentionSubject } from './attention-table.ts';

type MemoRouteId = MemoRoute['route'];

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
  /** Quests in review whose latest judge could not open a session (unopenedReviewsOf); from the quest files too. */
  readonly judges_unopened?: readonly UnopenedReview[];
  /** Tribes whose CLI says another version than their checked one (versionHoldsOf), as the Steward last found them. */
  readonly tribes_held?: readonly TribeHold[];
  /** The latest outcome of each quest's delivery to its forge (forgeOutcomesOf, PS-08c); from the log. */
  readonly deliveries?: readonly ForgeOutcome[];
}

const FIELD = /^\{(\w+)\}$/;

function itemOf(kind: AttentionKind, subject: AttentionSubject): AttentionItem {
  const { group, advice, command } = ATTENTION_TABLE[kind];
  const fields = new Map(Object.entries(subject));
  const words = command.map((word) => {
    const field = FIELD.exec(word)?.[1];
    return field === undefined ? word : String(fields.get(field));
  });
  return { kind, group, advice, command: words, ...subject };
}

const aboutQuest = (quest: QuestView): AttentionSubject => ({
  quest: quest.id,
  title: quest.title,
  rank: quest.rank,
});

/** The quest of the state, or its id alone when the state no longer holds it. */
const aboutId = (state: WorldState, id: QuestId): AttentionSubject => {
  const quest = state.quests[id];
  return quest === undefined ? { quest: id } : aboutQuest(quest);
};

const STATUS_KINDS: Readonly<Partial<Record<QuestView['status'], AttentionKind>>> = {
  awaiting_seal: 'awaiting_seal',
  infirmary: 'infirmary',
  draft: 'draft',
};

function questItems(state: WorldState): AttentionItem[] {
  return Object.values(state.quests).flatMap((quest) => {
    if (quest.question !== null)
      return [itemOf('question', { ...aboutQuest(quest), question: quest.question })];
    const kind = STATUS_KINDS[quest.status];
    return kind === undefined ? [] : [itemOf(kind, aboutQuest(quest))];
  });
}

/**
 * A done quest's delivery: stopped (the owner asks again with `deliver`), or its pull request open for the owner. A
 * quest no longer done (archived) has nothing left to do there; a merged one neither.
 */
function deliveryItems(state: WorldState, outcome: ForgeOutcome): AttentionItem[] {
  const quest = state.quests[outcome.data.quest];
  if (quest?.status !== 'done') return [];
  if (outcome.type === 'delivery.pushed')
    return [itemOf('delivery_waits', { ...aboutQuest(quest), url: outcome.data.pr.url })];
  if (outcome.type === 'delivery.merged') return [];
  const { stage, reason, pr } = outcome.data;
  return [
    itemOf('delivery_failed', {
      ...aboutQuest(quest),
      stage,
      reason,
      ...(pr === undefined ? {} : { url: pr.url }),
    }),
  ];
}

function noticeItems(state: WorldState, notices: StewardNotices): AttentionItem[] {
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
    ...(notices.deliveries ?? []).flatMap((outcome) => deliveryItems(state, outcome)),
    ...(notices.tribes_held ?? []).map(({ tribe, path, version, checked }) =>
      version === undefined
        ? itemOf('tribe_gone', { tribe, path, checked_version: checked })
        : itemOf('tribe_held', { tribe, path, version, checked_version: checked }),
    ),
  ];
}

/**
 * The item an open memo makes, by its route: none on its way to a judge or to its quest's author (PS-22b), `objection`
 * for the owner (an objection no judge may read, PS-22), else `memo`, a route not yet written included.
 */
const MEMO_ITEMS: Readonly<Record<MemoRouteId, AttentionKind | null>> = {
  chancellor: 'memo',
  judge: null,
  owner: 'objection',
  author: null,
};

const AMENDMENT_REFUSED: readonly string[] = AMENDMENT_REFUSALS;

/**
 * An amendment (PS-22b): while its quest is blocked, the quest's question item stands for it (the owner answers
 * there); else an author's referral to the owner is `memo_escalated` (below), one sent to the owner at filing a
 * `memo`, and one its author still decides none.
 */
function amendmentItem(state: WorldState, memo: MemoView): AttentionKind | null {
  const quest = memo.quest === null ? undefined : state.quests[memo.quest];
  if (quest?.status === 'blocked') return null;
  return memo.route === 'author' && memo.escalated === undefined ? null : 'memo';
}

const isAmendment = (memo: MemoView): boolean =>
  memo.route === 'author' || (memo.refusal !== undefined && AMENDMENT_REFUSED.includes(memo.refusal));

function memoKindOf(state: WorldState, memo: MemoView): AttentionKind | null {
  if (memo.route === null) return 'memo';
  return isAmendment(memo) ? amendmentItem(state, memo) : MEMO_ITEMS[memo.route];
}

function memoItems(state: WorldState): AttentionItem[] {
  return Object.values(state.memos).flatMap((memo) => {
    const kind = memoKindOf(state, memo);
    if (kind === null) return [];
    const quest = memo.quest === null ? {} : { quest: memo.quest };
    const subject = { memo: memo.id, memo_kind: memo.kind, from: memo.from, ...quest };
    const sent = memo.escalated;
    if (sent === undefined) return [itemOf(kind, subject)];
    // PS-03b: the Chancellor's triage sent it up, with its advice.
    const target = sent.quest === undefined ? {} : { target: sent.quest };
    return [itemOf('memo_escalated', { ...subject, triage: sent.action, ...target, holds: sent.holds })];
  });
}

/** A pool asleep; or awake with a current window at the owner's warning share or above. */
function manaItem(state: WorldState, pool: PoolView, now: Instant): AttentionItem[] {
  const key = { tribe: pool.tribe, pool: pool.pool };
  if (pool.asleep)
    return [
      itemOf('mana_asleep', { ...key, ...(pool.resets_at === null ? {} : { resets_at: pool.resets_at }) }),
    ];
  const live = pool.readings.filter((reading) => current(reading, now));
  const resets = live.map(({ resets_at }) => resets_at).find((at) => at !== null);
  const where = {
    ...key,
    ...(resets === undefined ? {} : { resets_at: resets }),
  };
  const used = Math.max(0, ...live.map(({ used_pct }) => used_pct));
  return used >= manaWarningOf(state.mana) ? [itemOf('mana_warning', { ...where, used_pct: used })] : [];
}

const rankOf = (item: AttentionItem): number => (item.rank === undefined ? -1 : RANKS.indexOf(item.rank));

/** Group, then kind in table order, then higher rank first, then id (a memo's own): the same state lists the same way. */
const byOrder = (a: AttentionItem, b: AttentionItem): number =>
  ATTENTION_GROUPS.indexOf(a.group) - ATTENTION_GROUPS.indexOf(b.group) ||
  ATTENTION_KINDS.indexOf(a.kind) - ATTENTION_KINDS.indexOf(b.kind) ||
  rankOf(b) - rankOf(a) ||
  String(a.memo ?? a.quest ?? a.pool ?? a.tribe).localeCompare(
    String(b.memo ?? b.quest ?? b.pool ?? b.tribe),
  );

/**
 * What waits for the owner at `now` (which tells a mana reading still current from one whose window reset): the
 * quests, open memos and pools of `state`, and the Steward's `notices`. A disabled tribe's pools say nothing.
 */
export function attentionQueue(
  state: WorldState,
  now: Instant,
  notices: StewardNotices = {},
): AttentionItem[] {
  const enabled = new Set(state.tribes.filter((tribe) => tribe.enabled).map(({ id }) => id));
  const pools = state.pools.filter(({ tribe }) => enabled.has(tribe));
  return [
    ...questItems(state),
    ...noticeItems(state, notices),
    ...memoItems(state),
    ...pools.flatMap((pool) => manaItem(state, pool, now)),
  ].toSorted(byOrder);
}
