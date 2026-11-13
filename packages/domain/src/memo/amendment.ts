// Amendments (PS-22b, implementation-plan §3.16.2, ADR 0024): a doer that finds its quest's description wrong, or a
// better way to its goal, writes an `amendment` memo instead of doing otherwise in silence. Whoever wrote the
// description decides it in a fresh session: the Chancellor for a quest drafted from the owner's words, the mage of
// the plan quest for one of its sub-quests. The quest records no author of its own: `created_by` and `parent_id` say
// it. Where the memo goes is decided here, from the quest, its author and its memos so far; the owner decides an
// amendment no author may (AMENDMENT_REFUSALS), as a question.
import { RANKS } from '../schema/common.ts';
import { AMENDMENT_REFUSALS } from '../schema/memo/constants.ts';
import type { CharacterId, QuestId } from '../core/ids.ts';
import type { AmendmentDecider } from '../schema/memo/constants.ts';
import type { Rank } from '../schema/common.ts';
import type { MemoRoute } from '../schema/memo/memo.ts';
import type { Quest } from '../schema/quest/quest.ts';

/** Who wrote a quest's description: the Chancellor, the mage of its plan, or nobody but the owner. */
export type QuestAuthor =
  | { readonly kind: 'chancellor' }
  | { readonly kind: 'mage'; readonly character: CharacterId }
  | { readonly kind: 'owner' };

type Lineage = Pick<Quest, 'created_by' | 'parent_id' | 'assignee'>;

export interface AuthorLookup {
  readonly quests: ReadonlyMap<QuestId, Lineage>;
  /** Whether a character may still be asked: its file is there and it is not suspended. */
  readonly present: (character: CharacterId) => boolean;
}

const OWNER: QuestAuthor = { kind: 'owner' };

/**
 * The quest's author. A quest the council made (a plan's sub-quest, a party's acceptance or merge quest) has the
 * author of the plan it came from: up its parents to the first one the council did not make, whose doer wrote the
 * plan. The owner's own quests, and the machine's (patrol, battle, campaign), have no author but the owner; so has a
 * sub-quest whose mage is gone.
 */
export function authorOf(quest: Lineage, { quests, present }: AuthorLookup): QuestAuthor {
  if (quest.created_by === 'chancellor') return { kind: 'chancellor' };
  const seen = new Set<QuestId>();
  let at: Lineage | undefined = quest;
  while (at?.created_by === 'council') {
    const parent: QuestId | null | undefined = at.parent_id;
    if (typeof parent !== 'string' || seen.has(parent)) return OWNER;
    seen.add(parent);
    at = quests.get(parent);
  }
  if (at === undefined || at === quest) return OWNER;
  const mage = at.assignee;
  return typeof mage === 'string' && present(mage) ? { kind: 'mage', character: mage } : OWNER;
}

const REFUSED: readonly string[] = AMENDMENT_REFUSALS;

/**
 * Who a quest waits for when the run that filed this memo ends: its author, or the owner, for an amendment (routed to
 * an author, or to the owner for a reason of AMENDMENT_REFUSALS); undefined for any other memo, which stops no run.
 */
export function amendmentDeciderOf(to: MemoRoute): AmendmentDecider | undefined {
  if (to.route === 'author') return 'author';
  return to.route === 'owner' && to.refusal !== undefined && REFUSED.includes(to.refusal)
    ? 'owner'
    : undefined;
}

/** The quest is blocked on its doer's amendment and its author has not decided it: the author's session is due. */
export const awaitsAuthor = (quest: Pick<Quest, 'status' | 'blocked'>): boolean => {
  const amendment = quest.blocked?.amendment;
  return (
    quest.status === 'blocked' &&
    amendment?.by === 'author' &&
    amendment.decision === undefined &&
    quest.blocked?.answer === undefined
  );
};

/**
 * Statuses in which an accepted amendment rewrites the description: no session holds the quest and its work is not
 * judged yet, so the next session (and its judge) reads the new text whole.
 */
export const AMENDABLE_STATUSES = [
  'draft',
  'open',
  'claimed',
  'returned',
  'blocked',
  'paused_mana',
  'infirmary',
] as const satisfies readonly Quest['status'][];

/** What an amendment is routed by: the quest's author and rank, the kingdom's threshold, the quest's memos so far. */
export interface Authoring {
  readonly author: QuestAuthor;
  readonly rank: Rank;
  /** kingdom.dispatch.amendments.from_rank. */
  readonly from_rank: Rank;
  /** The quest's memos filed so far, this letter's earlier ones included. */
  readonly memos: readonly { readonly kind: string }[];
}

/** A memo routed to an author with nothing known of its quest: only the owner may decide it. */
export const NO_AUTHORING: Authoring = { author: OWNER, rank: RANKS[0], from_rank: RANKS[0], memos: [] };

/**
 * Where a memo of `kind`, routed to its quest's author, goes: to the owner when the quest had one already (one per
 * quest, so the two never argue back and forth), when no character wrote the description, or below the kingdom's
 * rank; else to the Chancellor, or to the mage it names.
 */
export function authorRoute(kind: string, { author, rank, from_rank: from, memos }: Authoring): MemoRoute {
  if (memos.some((memo) => memo.kind === kind)) return { route: 'owner', refusal: 'second_amendment' };
  if (author.kind === 'owner') return { route: 'owner', refusal: 'no_author' };
  if (RANKS.indexOf(rank) < RANKS.indexOf(from)) return { route: 'owner', refusal: 'below_rank' };
  return author.kind === 'mage' ? { route: 'author', author: author.character } : { route: 'author' };
}
