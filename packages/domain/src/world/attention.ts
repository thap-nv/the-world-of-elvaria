// attentionQueue(state): everything that waits for the owner (implementation-plan §3.16.3, PS-03; glossary
// "attention"), as the digest, and later the world and the lite client, list it. Pure, from the world state and what
// the Steward knows that no file holds (its notices); each item has its group (the work waits on it, or it can wait),
// an advice code and the `elvaria` command that acts on it, both looked up in ATTENTION_TABLE by the item's kind.
// (PS-05) A done quest that still holds the scope other quests wait for comes from the caller too (scopeHoldsOf): the
// world state does not hold the quests' scopes. (PS-22) An open memo is an item by where it went: an objection on its way
// to a second judge waits for nobody, one no judge may read (MEMO_ROUTES `owner`) is the owner's to settle.
import { current } from '../mana/reading.ts';
import { manaWarningOf } from '../mana/state.ts';
import { RANKS } from '../schema/common.ts';
import type { Instant } from '../core/clock.ts';
import type { CharacterId, MemoId, QuestId, TribeId } from '../core/ids.ts';
import type { WaitGauge } from '../dispatch/judge-waits.ts';
import type { ScopeHold } from '../dispatch/scope.ts';
import type { Rank } from '../schema/common.ts';
import type { MemoRoute } from '../schema/memo/memo.ts';
import type { PoolView } from './mana-view.ts';
import type { QuestView } from './quest-view.ts';
import type { WorldState } from './world-state.ts';

type MemoRouteId = MemoRoute['route'];

export const ATTENTION_GROUPS = ['must', 'can_wait'] as const;
/** `must`: the work stands still until the owner decides; `can_wait`: nothing waits on it. */
export type AttentionGroup = (typeof ATTENTION_GROUPS)[number];

/**
 * Each kind of item, in the order the queue lists them within a group: its group, its advice (a code the renderer
 * words in the owner's language) and its command, the words after `elvaria`. `{field}` is the item's own field; `<…>`
 * is for the owner to fill in.
 */
export const ATTENTION_TABLE = {
  question: { group: 'must', advice: 'answer', command: ['answer', '{quest}', '<answer>'] },
  awaiting_seal: { group: 'must', advice: 'seal_or_return', command: ['seal', '{quest}'] },
  infirmary: { group: 'must', advice: 'retry_or_archive', command: ['quest', 'retry', '{quest}'] },
  judge_mana: {
    group: 'must',
    advice: 'judge_other_pool_or_wait',
    command: ['character', 'add', '<id>', '--class', '{class}', '--tribe', '<tribe>'],
  },
  unjudgeable: {
    group: 'must',
    advice: 'summon_judge',
    command: ['character', 'add', '<id>', '--class', '{class}', '--model', '<model>'],
  },
  unclaimable: { group: 'must', advice: 'see_why', command: ['quest', 'show', '{quest}'] },
  scope_held: { group: 'must', advice: 'merge_and_archive', command: ['quest', 'archive', '{quest}'] },
  draft: { group: 'must', advice: 'confirm_or_cancel', command: ['quest', 'confirm', '{quest}'] },
  objection: { group: 'can_wait', advice: 'settle_objection', command: ['memo', 'show', '{memo}'] },
  memo: { group: 'can_wait', advice: 'decide_memo', command: ['memo', 'show', '{memo}'] },
  mana_asleep: { group: 'can_wait', advice: 'wait_or_wake', command: ['wake', '{tribe}'] },
  mana_warning: { group: 'can_wait', advice: 'watch_mana', command: ['doctor'] },
} as const satisfies Record<
  string,
  { readonly group: AttentionGroup; readonly advice: string; readonly command: readonly string[] }
>;

export type AttentionKind = keyof typeof ATTENTION_TABLE;
export type AttentionAdvice = (typeof ATTENTION_TABLE)[AttentionKind]['advice'];
export const ATTENTION_KINDS = Object.keys(ATTENTION_TABLE) as readonly AttentionKind[];

/** What an item is about: the fields its line and its command name. */
export interface AttentionSubject {
  readonly quest?: QuestId;
  readonly title?: string;
  readonly rank?: Rank;
  /** The question of a quest that waits for the owner's answer. */
  readonly question?: string;
  /** A judging class of the quest's kind, for the command that summons a judge. */
  readonly class?: string;
  /** The quests that wait for a done quest's scope (scope_held, PS-05). */
  readonly waiting?: readonly QuestId[];
  /** The pools that hold every judge of a quest (judge_mana). */
  readonly gauges?: readonly WaitGauge[];
  readonly memo?: MemoId;
  readonly memo_kind?: string;
  readonly from?: CharacterId;
  readonly tribe?: TribeId;
  readonly pool?: string;
  readonly used_pct?: number;
  readonly resets_at?: string;
}

export interface AttentionItem extends AttentionSubject {
  readonly kind: AttentionKind;
  readonly group: AttentionGroup;
  readonly advice: AttentionAdvice;
  readonly command: readonly string[];
}

/** What the Steward knows that the world state does not: its notices, kept in its memory or in `.state/`. */
export interface StewardNotices {
  /** Open quests nobody can take (`quest.unclaimable`, `.state/unclaimable.json`). */
  readonly unclaimable?: readonly QuestId[];
  /** Quests in review whose judge the roster does not have (P1-15), with a judging class of their kind. */
  readonly unjudgeable?: readonly { readonly quest: QuestId; readonly class: string }[];
  /** Quests whose judges' mana is all closed (PS-03), with the pools that hold them. */
  readonly judge_waits?: readonly {
    readonly quest: QuestId;
    readonly class: string;
    readonly gauges: readonly WaitGauge[];
  }[];
  /** Done quests that still hold a scope quests wait for (scopeHoldsOf, PS-05); from the quest files, not the Steward's. */
  readonly scope_held?: readonly ScopeHold[];
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

function noticeItems(state: WorldState, notices: StewardNotices): AttentionItem[] {
  return [
    ...(notices.unclaimable ?? []).map((id) => itemOf('unclaimable', aboutId(state, id))),
    ...(notices.unjudgeable ?? []).map(({ quest, class: cls }) =>
      itemOf('unjudgeable', { ...aboutId(state, quest), class: cls }),
    ),
    ...(notices.judge_waits ?? []).map(({ quest, class: cls, gauges }) =>
      itemOf('judge_mana', { ...aboutId(state, quest), class: cls, gauges }),
    ),
    ...(notices.scope_held ?? []).map(({ quest, waiting }) =>
      itemOf('scope_held', { ...aboutId(state, quest), waiting }),
    ),
  ];
}

/**
 * The item an open memo makes, by its route: none on its way to a judge, `objection` for the owner (today only an
 * objection no judge may read goes there, PS-22), else `memo`, a route not yet written included.
 */
const MEMO_ITEMS: Readonly<Record<MemoRouteId, AttentionKind | null>> = {
  chancellor: 'memo',
  judge: null,
  owner: 'objection',
};

function memoItems(state: WorldState): AttentionItem[] {
  return Object.values(state.memos).flatMap((memo) => {
    const kind = memo.route === null ? 'memo' : MEMO_ITEMS[memo.route];
    if (kind === null) return [];
    const quest = memo.quest === null ? {} : { quest: memo.quest };
    return [itemOf(kind, { memo: memo.id, memo_kind: memo.kind, from: memo.from, ...quest })];
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
  String(a.memo ?? a.quest ?? a.pool).localeCompare(String(b.memo ?? b.quest ?? b.pool));

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
