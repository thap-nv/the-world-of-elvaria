// A party opens with its contract's delivery (implementation-plan §3.13 steps 2–3, ADR 0020; P1-18): the lead's
// subquests.json lists the parts (`party_role: part`, `contract`), and the Steward opens each one in the contract's
// party, waiting for the contract, then makes the merge quest itself so the party never depends on the lead
// remembering it; on a territory whose blind trial is due, the acceptance part too (§3.15, P1-21). Only a contract
// quest opens parts, and it opens nothing else; the party's invariants (domain's partyIssues: one territory, parts
// after the contract, the merge after every part) hold before anything is written.
import {
  acceptanceQuestOf,
  blindTrialDue,
  err,
  mergeQuestOf,
  ok,
  partyIssues,
  questFromCommand,
} from '@elvaria/domain';
import type {
  NewQuestContext,
  Parts,
  PartyQuest,
  PartyPlace,
  Quest,
  QuestDraft,
  QuestId,
  Result,
} from '@elvaria/domain';

import type { Context } from '../context.ts';

const refsOf = (drafts: readonly QuestDraft[]): string => drafts.map(({ ref }) => ref).join(', ');

/** Why a plan's list breaks the party rules: parts only from a contract, only parts from it, no party in a party. */
export function partyRefusal(plan: Quest, drafts: readonly QuestDraft[]): string | undefined {
  const heads = drafts.filter((draft) => draft.party_role === 'contract');
  if (heads.length > 0) return `${refsOf(heads)} would head a party: a sub-quest never forms one`;
  const parts = drafts.filter((draft) => draft.party_role === 'part');
  if (plan.party_role !== 'contract')
    return parts.length === 0
      ? undefined
      : `${refsOf(parts)} are parts of a party: only a party's contract quest opens parts`;
  const others = drafts.filter((draft) => draft.party_role !== 'part');
  return others.length === 0
    ? undefined
    : `${refsOf(others)} are no parts: a party's contract quest opens only its parts`;
}

/** The place in the contract's party of a part the plan's list names (none for a plain plan's child). */
export const partyPlaceOf = (plan: Quest, draft: QuestDraft): PartyPlace | undefined =>
  plan.party_role === 'contract' && draft.contract !== undefined
    ? { id: plan.id, role: 'part', contract: draft.contract }
    : undefined;

/** The refs the ids of the quests the Steward adds derive from, beside the drafts' `d<n>` refs (childIdOf). */
export const MERGE_REF = 'merge';
export const ACCEPTANCE_REF = 'acceptance';

/** The ids of the quests the Steward adds to a party (childIdOf of the contract and the refs above). */
export interface AddedIds {
  /** None when the party has no blind trial (acceptanceIdFor). */
  readonly acceptance: QuestId | undefined;
  readonly merge: QuestId;
}

type Made = Result<Quest | undefined, string>;

/**
 * `id`, the blind trial's acceptance part (§3.15, P1-21), when the party has one: found when a crash left it written,
 * whatever the territory says now, or due on the contract's territory for the ranks of the lead's drafts. Decided
 * once, before any part is made, because every part waits for it (P1-37 (iii), domain's partWaitsFor).
 */
export function acceptanceIdFor(
  ctx: Context,
  plan: Quest,
  drafts: readonly Pick<Quest, 'rank'>[],
  id: QuestId,
): QuestId | undefined {
  if (ctx.world.quests.has(id)) return id;
  const territory = ctx.world.territories.get(plan.territory);
  return territory !== undefined && blindTrialDue(territory, plan, drafts) ? id : undefined;
}

/** `made`, or why questFromCommand refused the quest the Steward meant to add. */
function added(payload: PartyQuest, context: NewQuestContext, what: string): Result<Quest, string> {
  const made = questFromCommand(payload.payload, { ...context, party: payload.party });
  return made.ok ? ok(made.value) : err(`the ${what} is refused: ${made.error.code}`);
}

/** The acceptance part acceptanceIdFor named: made, or found when a crash left it written. */
function acceptanceQuestFor(ctx: Context, plan: Quest, parts: Parts, context: NewQuestContext): Made {
  const before = ctx.world.quests.get(context.id);
  if (before !== undefined) return ok(before);
  const checks = ctx.world.territories.get(plan.territory)?.checks ?? [];
  const tags = ctx.world.registry.tags.map(({ id }) => id);
  return added(acceptanceQuestOf(plan, parts, { territory: { checks }, tags }), context, 'acceptance part');
}

/**
 * The quests the Steward adds to the party of the contract `plan` beside its `parts`, made or found when a crash
 * left them written: the blind trial's acceptance part when it is due, then the merge quest, which waits for it too.
 */
export function addedQuestsFor(
  ctx: Context,
  plan: Quest,
  parts: readonly Quest[],
  context: Omit<NewQuestContext, 'id'>,
  ids: AddedIds,
): Result<Quest[], string> {
  const [first, ...rest] = parts;
  // partyRefusal let a contract's list through only when it has parts, and the schema wants one draft at least.
  if (first === undefined) return err('the contract opens no part');
  const quests = [...context.quests, ...(ids.acceptance === undefined ? [] : [ids.acceptance]), ids.merge];
  const tests =
    ids.acceptance === undefined
      ? ok(undefined)
      : acceptanceQuestFor(ctx, plan, [first, ...rest], { ...context, quests, id: ids.acceptance });
  if (!tests.ok) return tests;
  const all: Parts = [first, ...rest, ...(tests.value === undefined ? [] : [tests.value])];
  const before = ctx.world.quests.get(ids.merge);
  const merge =
    before === undefined
      ? added(mergeQuestOf(plan, all), { ...context, quests, id: ids.merge }, 'merge quest')
      : ok(before);
  return merge.ok ? ok([...all.slice(parts.length), merge.value]) : merge;
}

/** What breaks the party's invariants once its new quests are in, or undefined; one broken rule opens none. */
export function partyProblem(ctx: Context, plan: Quest, made: readonly Quest[]): string | undefined {
  if (plan.party_id === undefined) return undefined;
  const ids = new Set<QuestId>(made.map(({ id }) => id));
  const others = [...ctx.world.quests.values()].filter(({ id }) => !ids.has(id));
  const issues = partyIssues([...others, ...made]).filter(({ party }) => party === plan.party_id);
  return issues.length === 0
    ? undefined
    : issues.map(({ quest, message }) => `${quest}: ${message}`).join('; ');
}
