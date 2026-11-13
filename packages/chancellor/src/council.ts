// The council in the Chancellor's reply (implementation-plan §3.16.6, ADR 0028, PS-06): work as large as
// kingdom.dispatch.council says comes as one plan quest for a mage with a brief that names it, not as quests to do.
// The domain's councilDue decides how large; this file says which drafts of a reply break the rule.
import { councilDue, sharedGlobsOf } from '@elvaria/domain';
import type { Brief, Council, QuestDraft, Registry, Territory } from '@elvaria/domain';

export type CouncilProblem = 'needs_council' | 'needs_brief' | 'brief_not_on_plan';

export interface CouncilContext {
  readonly registry: Pick<Registry, 'kinds'>;
  readonly territories: readonly Pick<Territory, 'id' | 'shared_paths'>[];
  /** Absent for the triage of memos: a memo's work is a single quest or the owner's. */
  readonly council?: Council | undefined;
}

/**
 * The drafts of a reply the council rule drops, by ref: every draft when work of the council's size has no plan; a
 * plan of that size the brief does not name; the draft a brief names when its kind delivers no sub-quests.
 */
export function councilDrops(
  drafts: readonly QuestDraft[],
  context: CouncilContext,
  brief?: Brief,
): ReadonlyMap<string, CouncilProblem> {
  const plans = new Set(
    drafts
      .filter((draft) =>
        context.registry.kinds.some(
          ({ id, deliverable_type: type }) => id === draft.kind && type === 'subquests',
        ),
      )
      .map(({ ref }) => ref),
  );
  const drops = new Map<string, CouncilProblem>();
  if (brief !== undefined && !plans.has(brief.plan_ref)) drops.set(brief.plan_ref, 'brief_not_on_plan');
  const { council } = context;
  if (council === undefined) return drops;
  const sharedOf = (id: string) =>
    sharedGlobsOf(context.territories.find((territory) => territory.id === id));
  if (!councilDue(drafts, council, sharedOf)) return drops;
  if (plans.size === 0) return new Map(drafts.map(({ ref }) => [ref, 'needs_council']));
  for (const ref of plans) if (ref !== brief?.plan_ref) drops.set(ref, 'needs_brief');
  return drops;
}
