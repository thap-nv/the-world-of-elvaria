// A party opens with its contract's delivery (implementation-plan §3.13 steps 2–3, ADR 0020; P1-18): the lead's
// subquests.json lists the parts (`party_role: part`, `contract`), and the Steward opens each one in the contract's
// party, waiting for the contract, then makes the merge quest itself so the party never depends on the lead
// remembering it. Only a contract quest opens parts, and it opens nothing else; the party's invariants (domain's
// partyIssues: one territory, parts after the contract, the merge after every part) hold before anything is written.
import { err, mergeQuestOf, ok, partyIssues, questFromCommand } from '@elvaria/domain';
import type { NewQuestContext, PartyPlace, Quest, QuestDraft, QuestId, Result } from '@elvaria/domain';

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

/** The ref the merge quest's id derives from, beside the drafts' `d<n>` refs (deliver/subquests.ts, childIdOf). */
export const MERGE_REF = 'merge';

/**
 * The merge quest `id` of the contract `plan` whose parts are `parts`: made, or found when a crash left it written.
 */
export function mergeQuestFor(
  ctx: Context,
  plan: Quest,
  parts: readonly Quest[],
  context: NewQuestContext,
): Result<Quest, string> {
  const id = context.id;
  const before = ctx.world.quests.get(id);
  if (before !== undefined) return ok(before);
  const [first, ...rest] = parts;
  // partyRefusal let a contract's list through only when it has parts, and the schema wants one draft at least.
  if (first === undefined) return err('the contract opens no part');
  const { payload, party } = mergeQuestOf(plan, [first, ...rest]);
  const made = questFromCommand(payload, { ...context, party });
  return made.ok ? ok(made.value) : err(`the merge quest is refused: ${made.error.code}`);
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
