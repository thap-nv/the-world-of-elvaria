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
// comes from the log (forgeOutcomesOf, PS-08c). A newer build of Elvaria comes from the CLI, which keeps the pin
// (`upgrade`, PS-08d). The notices' items are attention-notices.ts's.
import { current } from '../mana/reading.ts';
import { manaWarningOf } from '../mana/state.ts';
import { RANKS } from '../schema/common.ts';
import { AMENDMENT_REFUSALS } from '../schema/memo/constants.ts';
import { ATTENTION_GROUPS, ATTENTION_KINDS } from './attention-table.ts';
import { aboutQuest, itemOf, noticeItems } from './attention-notices.ts';
import type { Instant } from '../core/clock.ts';
import type { MemoRoute } from '../schema/memo/memo.ts';
import type { MemoView } from './memo-view.ts';
import type { PoolView } from './mana-view.ts';
import type { QuestView } from './quest-view.ts';
import type { WorldState } from './world-state.ts';
import type { StewardNotices } from './attention-notices.ts';
import type { AttentionItem, AttentionKind } from './attention-table.ts';

export type { StewardNotices, UpgradeOffer } from './attention-notices.ts';

type MemoRouteId = MemoRoute['route'];

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
    if (kind === undefined) return [];
    // PS-08b: the seal the machine raised on a quest the delegation had spared says why.
    const raised =
      kind === 'awaiting_seal' && quest.seal_raised !== undefined ? { raised: quest.seal_raised } : {};
    return [itemOf(kind, { ...aboutQuest(quest), ...raised })];
  });
}

/**
 * The item an open memo makes, by its route: none on its way to a judge or to its quest's author (PS-22b), `objection`
 * for the owner (an objection no judge may read, PS-22), else `memo`, a route not yet written included. (PS-09c) None
 * for an advisory: the quests it went to read it, nobody decides it.
 */
const MEMO_ITEMS: Readonly<Record<MemoRouteId, AttentionKind | null>> = {
  chancellor: 'memo',
  judge: null,
  owner: 'objection',
  author: null,
  quests: null,
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

/**
 * (PS-12c) A memo sent to the owner is an `objection` only when an objection went there for want of a judge, which its
 * refusal says (an amendment's is read first); one sent there as it is, the temple's letter for a stronger model, is a
 * `memo` the owner decides.
 */
const isLetterToOwner = (memo: MemoView): boolean => memo.route === 'owner' && memo.refusal === undefined;

function memoKindOf(state: WorldState, memo: MemoView): AttentionKind | null {
  if (memo.route === null) return 'memo';
  if (isAmendment(memo)) return amendmentItem(state, memo);
  return isLetterToOwner(memo) ? 'memo' : MEMO_ITEMS[memo.route];
}

function memoItems(state: WorldState): AttentionItem[] {
  return Object.values(state.memos).flatMap((memo) => {
    const kind = memoKindOf(state, memo);
    if (kind === null) return [];
    const quest = memo.quest === null ? {} : { quest: memo.quest };
    const from = memo.from === undefined ? {} : { from: memo.from };
    const subject = { memo: memo.id, memo_kind: memo.kind, ...from, ...quest };
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
