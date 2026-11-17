// The advisory (PS-09c, implementation-plan §3.16.2, ADR 0024 amended): as a quest reaches its base branch, the
// Steward writes one memo itself to the quests at work in the same territory whose scope meets the files it changed,
// so each learns of it in its next assignee session, before it submits, instead of the coordinator telling it by hand.
// Its kind is the registry's kind routed to `quests`, found by the route (no switch on a kind, ADR 0016). A memo to
// quests changes no quest and nobody answers it: each quest reads it once (deliveries), and it ends `delivered` or
// `lapsed`. Pure: the Steward reads what the quest touched and which of those files the territory's shared_paths
// match (the merge queue's own reading), and hashes the key.
import { baseChainOf, scopeOf, scopesMeet } from '../dispatch/scope.ts';
import { MEMO_REFS_MAX } from '../schema/memo/constants.ts';
import { partyOf } from '../verify/past-assignees-of.ts';
import type { QuestId } from '../core/ids.ts';
import type { Memo, MemoDelivery } from '../schema/memo/memo.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Registry } from '../schema/registry.ts';

/** Whether `quest` has run, holds its plot and may still open an assignee session: it may read an advisory. */
const atWork = (quest: Quest): boolean =>
  quest.tier === 'session' &&
  quest.plot.type === 'worktree' &&
  (quest.attempts > 0 || quest.attempt_log.length > 0) &&
  !['draft', 'done', 'archived'].includes(quest.status);

/** The files of `files` a scope may name (scopesMeet: a doubt is a meeting); every one for a quest without a scope. */
const filesIn = (quest: Quest, files: readonly string[]): string[] => {
  const scope = scopeOf(quest);
  return scope.length === 0 ? [...files] : files.filter((file) => scopesMeet([file], scope));
};

/**
 * The quests at work of `source`'s territory whose scope meets `files` (shared paths left out by the caller), by id: never
 * `source`, its party, a quest whose plot is built on its branch or one its plot is built on (baseChainOf), which have
 * its work already; a quest without a scope gets every advisory, as R3 holds it apart from every scope.
 */
export function recipientsOf(source: Quest, files: readonly string[], quests: readonly Quest[]): QuestId[] {
  if (files.length === 0) return [];
  const party = new Set(partyOf(source, quests).map(({ id }) => id));
  const chain = baseChainOf(source, quests);
  return quests
    .filter(
      (quest) =>
        quest.id !== source.id &&
        quest.territory === source.territory &&
        atWork(quest) &&
        !party.has(quest.id) &&
        !chain.has(quest.id) &&
        !baseChainOf(quest, quests).has(source.id) &&
        filesIn(quest, files).length > 0,
    )
    .map(({ id }) => id)
    .toSorted();
}

/** Who an advisory goes to and the files it names, at most MEMO_REFS_MAX of them; `more` counts the rest. */
export interface Advisory {
  readonly quests: readonly QuestId[];
  readonly refs: readonly string[];
  readonly more: number;
}

/**
 * The advisory of `landed` reaching its base branch with `changed` files, `shared` of them matched by the territory's
 * shared_paths (the machine merges those, so they never count); undefined when nobody gets one. A party's parts and
 * contract write none: their merge quest's one holds their work.
 */
export function advisoryOf(
  landed: Quest,
  changed: readonly string[],
  quests: readonly Quest[],
  shared: readonly string[],
): Advisory | undefined {
  if (landed.party_id !== undefined && landed.party_role !== 'merge') return undefined;
  const files = changed.filter((file) => !shared.includes(file)).toSorted();
  const recipients = recipientsOf(landed, files, quests);
  if (recipients.length === 0) return undefined;
  const taken = recipients.flatMap((id) => quests.filter((quest) => quest.id === id));
  const named = files.filter((file) => taken.some((quest) => filesIn(quest, [file]).length > 0));
  return {
    quests: recipients,
    refs: named.slice(0, MEMO_REFS_MAX),
    more: Math.max(0, named.length - MEMO_REFS_MAX),
  };
}

/** The kind the Steward writes an advisory as: the registry's first kind routed to quests; none in an older registry. */
export const advisoryKindOf = (registry: Pick<Registry, 'memos'>): string | undefined =>
  registry.memos.find(({ route }) => route === 'quests')?.id;

/** What the Steward hashes for the advisory's id: the quest alone, so one quest reaching its base writes one. */
export const advisoryKeyOf = (landed: QuestId, kind: string): string =>
  [landed, kind, 'reached its base branch'].join('\n');

/**
 * The advisory's text, in English as every memo: which quest, its title, the commit, how to read the new version of a
 * file, and what happens next to the reader's branch.
 */
export function advisoryBodyOf(landed: Pick<Quest, 'id' | 'title'>, commit: string, more: number): string {
  const rest = more === 0 ? '' : `, and ${String(more)} more`;
  return [
    `Quest ${landed.id} ("${landed.title}") reached the base branch at ${commit}, changing files your scope may hold: those this advisory names${rest}.`,
    `Read the new version of one with \`git show ${commit}:<path>\`.`,
    'Your branch is merged with the base branch when it is delivered: where you change the same lines as this change, that merge stops on a conflict that a quest of its own must resolve.',
  ].join(' ');
}

/** Whether `quest` has read the advisory already. */
const readBy = (memo: Memo, quest: QuestId): boolean =>
  (memo.deliveries ?? []).some((delivery) => delivery.quest === quest);

/** The open memos to quests that `quest` has yet to read, newest first: what its next assignee session reads. */
export const advisoriesFor = (memos: readonly Memo[], quest: QuestId): Memo[] =>
  memos
    .filter(
      (memo) => memo.state === 'open' && memo.to.quests?.includes(quest) === true && !readBy(memo, quest),
    )
    .toSorted((a, b) => b.filed_at.localeCompare(a.filed_at) || b.id.localeCompare(a.id));

/** The files of an advisory that `quest`'s scope may hold; every one when none of them meets it (its scope changed). */
export function advisoryRefsFor(memo: Pick<Memo, 'refs'>, quest: Quest): readonly string[] {
  const own = filesIn(quest, memo.refs);
  return own.length === 0 ? memo.refs : own;
}

/** The memo read by one more quest (memo.delivered); one that read it already reads nothing new. */
export const deliveredTo = (memo: Memo, delivery: MemoDelivery): Memo =>
  readBy(memo, delivery.quest) ? memo : { ...memo, deliveries: [...(memo.deliveries ?? []), delivery] };

/** A quest left before reading: done, archived (cancelled included), or gone. */
const left = (quest: Pick<Quest, 'status'> | undefined): boolean =>
  quest === undefined || quest.status === 'done' || quest.status === 'archived';

/**
 * How an open memo to quests ends now: `delivered` once every quest it went to read it or left, one at least having
 * read it; `lapsed` once every one left without; undefined while one may still read it, or for any other memo.
 */
export function deliveryEndOf(
  memo: Memo,
  questOf: (id: QuestId) => Pick<Quest, 'status'> | undefined,
): 'delivered' | 'lapsed' | undefined {
  const to = memo.to.quests;
  if (memo.state !== 'open' || to === undefined) return undefined;
  if (to.some((quest) => !readBy(memo, quest) && !left(questOf(quest)))) return undefined;
  return (memo.deliveries ?? []).length > 0 ? 'delivered' : 'lapsed';
}
