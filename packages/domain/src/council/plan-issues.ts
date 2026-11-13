// The machine half of the plan review (implementation-plan §3.16.6, ADR 0028, PS-06): what the Steward's subquests
// check finds wrong in a plan's sub-quests before any judge reads it, so a plan the Steward would run badly goes back
// to its mage whatever the judge says. The judge's half is the ritual step check_plan_ready. Overlap is the scope rule
// the Steward runs by (scopesMeet, PS-05): two sub-quests that may run at once, neither waiting for the other, must
// have scopes apart. A party's merge quest is the Steward's, not a draft: it waits for every part, so never overlaps.
import { scopesMeet, sharedGlobsOf } from '../dispatch/scope.ts';
import { templateIssueLine, templateIssuesOf } from './template.ts';
import type { QuestDraft } from '../schema/quest/quest-draft.ts';
import type { Territory } from '../schema/territory.ts';
import type { TemplateIssue } from './template.ts';

export type PlanIssue =
  /** A session sub-quest changes files, so it names them (scope_paths). */
  | { readonly code: 'no_scope'; readonly ref: string }
  /** Two sub-quests may run at once and their scopes meet. */
  | { readonly code: 'scopes_meet'; readonly ref: string; readonly other: string }
  /** Its peak context passes the kingdom's context budget: it does not fit one session (ADR 0017). */
  | { readonly code: 'over_context'; readonly ref: string; readonly context: number; readonly budget: number }
  /** Its description lacks part of the quest template. */
  | { readonly code: 'template'; readonly ref: string; readonly issue: TemplateIssue };

export interface PlanContext {
  readonly territories: readonly Pick<Territory, 'id' | 'shared_paths' | 'checks'>[];
  /** `kingdom.breakers.context_budget_tokens`. */
  readonly context_budget_tokens: number;
}

/** Each draft's refs it waits on, directly or through others (depends_on_refs); a circle is refused elsewhere. */
export function waitsOf(drafts: readonly QuestDraft[]): ReadonlyMap<string, ReadonlySet<string>> {
  const direct = new Map(drafts.map(({ ref, depends_on_refs: on }) => [ref, on]));
  return new Map(
    drafts.map(({ ref, depends_on_refs: on }) => {
      const seen = new Set<string>();
      const queue = [...on];
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(...(direct.get(next) ?? []));
      }
      return [ref, seen];
    }),
  );
}

/** The pairs of scoped sub-quests on one territory that may run at once and whose scopes meet. */
function overlaps(
  drafts: readonly QuestDraft[],
  waits: ReadonlyMap<string, ReadonlySet<string>>,
  context: PlanContext,
): PlanIssue[] {
  const ordered = (a: string, b: string): boolean =>
    waits.get(a)?.has(b) === true || waits.get(b)?.has(a) === true;
  const scoped = drafts.flatMap((draft) =>
    draft.scope_paths === undefined ? [] : [{ draft, scope: draft.scope_paths }],
  );
  return scoped.flatMap(({ draft, scope }, index) => {
    const shared = sharedGlobsOf(context.territories.find(({ id }) => id === draft.territory));
    return scoped
      .slice(index + 1)
      .filter(({ draft: other }) => other.territory === draft.territory && !ordered(draft.ref, other.ref))
      .filter((other) => scopesMeet(scope, other.scope, shared))
      .map(({ draft: other }): PlanIssue => ({ code: 'scopes_meet', ref: draft.ref, other: other.ref }));
  });
}

/**
 * Only a peak the mage gave is held against the budget: a draft without one predates PS-06 (a kingdom's own copy of
 * the mage's prompt), and its tokens count a whole session, not one context.
 */
function overContext(draft: QuestDraft, budget: number): PlanIssue[] {
  const peak = draft.estimate.context;
  return peak === undefined || peak <= budget
    ? []
    : [{ code: 'over_context', ref: draft.ref, context: peak, budget }];
}

/** What is wrong with a plan's sub-quests; none when the Steward can run them as listed. */
export function planIssuesOf(drafts: readonly QuestDraft[], context: PlanContext): PlanIssue[] {
  const sessions = drafts.filter(({ tier }) => tier === 'session');
  const checksOf = (territory: string): readonly string[] | undefined =>
    context.territories.find(({ id }) => id === territory)?.checks.map(({ id }) => id);
  return [
    ...sessions.flatMap(({ ref, scope_paths: scope }): PlanIssue[] =>
      scope === undefined ? [{ code: 'no_scope', ref }] : [],
    ),
    ...overlaps(sessions, waitsOf(drafts), context),
    ...sessions.flatMap((draft) => overContext(draft, context.context_budget_tokens)),
    ...sessions.flatMap((draft) =>
      templateIssuesOf(draft, checksOf(draft.territory)).map((issue): PlanIssue => ({
        code: 'template',
        ref: draft.ref,
        issue,
      })),
    ),
  ];
}

/** The issue in English, one line of the subquests check's log. */
export function planIssueLine(issue: PlanIssue): string {
  if (issue.code === 'no_scope')
    return `${issue.ref} has no scope_paths: a sub-quest that changes files names them`;
  if (issue.code === 'scopes_meet')
    return `${issue.ref} and ${issue.other} may run at once and their scopes meet: one waits for the other (depends_on_refs), or their scopes part`;
  if (issue.code === 'over_context')
    return `${issue.ref} holds ${issue.context} tokens of context at its peak, above ${issue.budget}: split it`;
  return `${issue.ref}: ${templateIssueLine(issue.issue)}`;
}
