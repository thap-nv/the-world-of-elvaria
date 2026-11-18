// Which done quests give their plot back because their branch reached the base branch (implementation-plan §3.16.7,
// ADR 0023; PS-08d, (E) of the PS-08 plan), under every delivery mode. The Steward looks outside the tick (steward
// forge/in-base.ts): it fetches a territory's base branch once and asks each done quest's plot (Plots.inBase), right
// after a `delivery.merged` there and every BASE_LOOK_MINUTES while a quest is there to ask about. A quest found
// there, or whose pull request the Steward merged (a squash leaves no ancestry), is archived by the Steward, which
// then releases its plot; a party's parts and contract go with their merge quest, whose merge holds their commits.
// (PS-09b) The merge queue's merge quest in the base branch takes the quest it stands for with it (its parent): its
// branch holds that quest's, but a squash or a rebase by the forge leaves no ancestry for a look to find. So does a
// party's (fix/merge-quest-followups (l)): every merge quest of a party takes the party's contract and parts with it.
import { BASE_LOOK_MINUTES, MS_PER_MINUTE } from '../constants.ts';
import { isPartyPart } from '../party/party-status.ts';
import { isQueueMerge } from '../party/queue-merge-quest.ts';
import type { Instant } from '../core/clock.ts';
import type { QuestId, TerritoryId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { BackgroundWork } from './reviews.ts';

/** When the Steward last looked on a territory; one with a merge since has none. */
export interface BaseLookDone {
  readonly territory: TerritoryId;
  readonly at: Instant;
}

export interface InBaseSource {
  readonly background?: BackgroundWork;
  /** Done quests whose branch is in the base branch: found by a look, or merged by the Steward. Absent: none. */
  readonly in_base?: readonly QuestId[];
  /** The Steward's last looks; absent: none yet, so every territory with a quest to ask about is looked at. */
  readonly base_looks?: readonly BaseLookDone[];
  /** Every quest, archived ones too (PS-09b): the parents of the merge queue's merge quests in base. Absent: none. */
  readonly quests?: readonly Quest[];
}

/** One look: a territory's base branch fetched once, then each of its done quests asked. */
export interface BaseLook {
  readonly territory: TerritoryId;
  readonly quests: readonly QuestId[];
}

/** A done quest whose work went to the owner on a branch of its own: what a look asks about. */
const onBranch = (quest: Quest): boolean =>
  quest.deliverable.delivered_at !== undefined &&
  quest.plot.type === 'worktree' &&
  quest.plot.branch !== undefined;

/** The territories to look at now, each with the done quests on a branch that no look found in base yet. */
export function baseLooks(source: InBaseSource, done: readonly Quest[], now: Instant): BaseLook[] {
  const found = new Set(source.in_base);
  const last = new Map((source.base_looks ?? []).map(({ territory, at }) => [territory, at]));
  const asked = new Map<TerritoryId, QuestId[]>();
  for (const quest of done.filter((each) => onBranch(each) && !found.has(each.id)))
    asked.set(quest.territory, [...(asked.get(quest.territory) ?? []), quest.id]);
  const due = (territory: TerritoryId): boolean => {
    const at = last.get(territory);
    return at === undefined || now - at >= BASE_LOOK_MINUTES * MS_PER_MINUTE;
  };
  return [...asked]
    .filter(([territory]) => due(territory))
    .map(([territory, quests]) => ({ territory, quests }));
}

/**
 * The work of party `party` a merge quest's branch holds: its contract and its parts, the acceptance part too. A quest
 * with a party role always names its party (quest schema), so a quest outside a party has none.
 */
const partyWorkOf = (party: QuestId | undefined, quests: readonly Quest[]): QuestId[] =>
  quests
    .filter((quest) => quest.party_id === party && (quest.party_role === 'contract' || isPartyPart(quest)))
    .map(({ id }) => id);

/**
 * What the merge quests in `found` took into the base branch with them: the quest a merge queue's one stands for (its
 * parent, PS-09b), and the contract and parts of the party a merge quest is of, its own or the queue's
 * (fix/merge-quest-followups (l)). Their commits are in its merge, but a squash leaves them no ancestry to be found by.
 */
const carriedBy = (found: ReadonlySet<QuestId>, quests: readonly Quest[]): QuestId[] =>
  quests.flatMap((quest) => {
    if (!found.has(quest.id) || quest.party_role !== 'merge') return [];
    const parent = isQueueMerge(quest) && typeof quest.parent_id === 'string' ? [quest.parent_id] : [];
    return [...parent, ...partyWorkOf(quest.party_id, quests)];
  });

/** The done quests the Steward archives now: in the base branch, no delivery of theirs still running. */
export function forgeArchives(source: InBaseSource, done: readonly Quest[]): QuestId[] {
  const inBase = new Set(source.in_base);
  const found = new Set([...inBase, ...carriedBy(inBase, source.quests ?? [])]);
  const running = new Set(source.background?.running);
  return done.filter(({ id }) => found.has(id) && !running.has(id)).map(({ id }) => id);
}
