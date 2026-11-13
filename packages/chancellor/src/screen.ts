// What the Chancellor drafted, held against the kingdom's files (implementation-plan §3.11, ADR 0013, 0016): the
// quest-draft schema checks shapes, not whether a tag, kind or secret exists. A draft that names something the
// kingdom does not have is dropped here, with its reason, instead of being refused by the Steward one tick later;
// so is every draft that waits on a dropped one. The rest come back in an order where each follows what it names.
// PS-06: a job is split by its peak context; a session draft follows the quest template, and work of the council's
// size comes as a plan with a brief. The last two send the reply back to the Chancellor once (draftQuests).
import { peakContextOf, scriptParamsIssues, templateIssueLine, templateIssuesOf } from '@elvaria/domain';
import type { Brief, Council, Kind, QuestDraft, Registry, Territory } from '@elvaria/domain';

import { councilDrops } from './council.ts';

export const DROP_REASONS = [
  'unknown_kind',
  'unknown_territory',
  'class_not_allowed',
  // Tags are a closed vocabulary (registry/tags.json), so reputation per tag does not splinter (§9.1 item 21).
  'unknown_tag',
  'unknown_script',
  'script_not_for_kind',
  // Params a model wrote must fit the catalog's params_schema; the Steward would refuse them anyway (§3.12).
  'invalid_script_params',
  // One quest, one context (ADR 0017): a job above context_budget_tokens is split into a plan and its children.
  'over_context_budget',
  // The Chancellor cannot add secrets: only names the territory allows reach a session (ADR 0013).
  'secret_not_allowed',
  // Parts come from the party lead's output once the contract exists, never from the Chancellor (§3.13).
  'party_part',
  'needs_dropped_draft',
  'dependency_cycle',
  // PS-06: the description misses part of the quest template (owner, 2026-11-12).
  'template',
  // PS-06: work of the council's size drafted as quests to do, not as a plan (ADR 0028).
  'needs_council',
  // PS-06: a plan for work of the council's size that no brief names.
  'needs_brief',
  // PS-06: the brief names a draft whose kind delivers no sub-quests.
  'brief_not_on_plan',
] as const;
export type DropReason = (typeof DROP_REASONS)[number];

/** The reasons the Chancellor gets one more try for (draftQuests): its own drafting, not what the kingdom lacks. */
export const RETURNED_REASONS: ReadonlySet<DropReason> = new Set([
  'template',
  'needs_council',
  'needs_brief',
  'brief_not_on_plan',
]);

export interface DroppedDraft {
  readonly ref: string;
  readonly title: string;
  readonly reason: DropReason;
  /** What was not found or not allowed: the tag, kind, secret, or the ref of the dropped draft. */
  readonly detail?: string;
}

export interface ScreenedDrafts {
  /** In an order where each draft comes after the drafts it depends on and its parent. */
  readonly kept: readonly QuestDraft[];
  readonly dropped: readonly DroppedDraft[];
}

export interface ScreenContext {
  readonly registry: Pick<Registry, 'kinds' | 'tags' | 'scripts'>;
  readonly territories: readonly Pick<Territory, 'id' | 'secrets_allowed' | 'shared_paths' | 'checks'>[];
  /** `kingdom.breakers.context_budget_tokens`: the most context one quest may hold at once (ADR 0017). */
  readonly context_budget_tokens: number;
  /** `kingdom.dispatch.council` (PS-06); absent, as for the triage of memos, no reply is held to the council. */
  readonly council?: Council;
}

type Problem = Pick<DroppedDraft, 'reason' | 'detail'>;

const problem = (reason: DropReason, detail?: string): Problem =>
  detail === undefined ? { reason } : { reason, detail };

/** What the draft's script is told, checked against the catalog entry it names. */
function scriptProblem(draft: QuestDraft, kind: Kind, scripts: Registry['scripts']): Problem | undefined {
  if (draft.script === undefined) return undefined;
  const script = scripts.find(({ id }) => id === draft.script?.id);
  if (script === undefined) return problem('unknown_script', draft.script.id);
  if (!script.kinds.includes(kind.id)) return problem('script_not_for_kind', script.id);
  const [issue] = scriptParamsIssues(script, draft.script.params);
  return issue === undefined ? undefined : problem('invalid_script_params', `${script.id}: ${issue}`);
}

/**
 * A job that does not fit one context and was not split (§3.11, ADR 0017). A draft that plans (its kind delivers
 * sub-quests) or that other drafts name as their parent is the split itself, so it passes whatever its estimate.
 */
function tooLong(
  draft: QuestDraft,
  kind: Kind,
  parents: ReadonlySet<string>,
  budget: number,
): Problem | undefined {
  // The peak context decides (PS-06, ADR 0017 amended): a draft's tokens count a whole session, cached reads at a tenth.
  const peak = peakContextOf(draft.estimate);
  if (peak <= budget || kind.deliverable_type === 'subquests' || parents.has(draft.ref)) return undefined;
  return problem('over_context_budget', `${peak} > ${budget}`);
}

/** What the description lacks of the quest template, with the territory's checks (PS-06). */
function templateProblem(draft: QuestDraft, territory: Pick<Territory, 'checks'>): Problem | undefined {
  const issues = templateIssuesOf(
    draft,
    territory.checks.map(({ id }) => id),
  );
  return issues.length === 0 ? undefined : problem('template', issues.map(templateIssueLine).join('; '));
}

/** The first thing the draft names that the kingdom does not have, if any. */
function problemOf(
  draft: QuestDraft,
  { registry, territories, context_budget_tokens: budget }: ScreenContext,
  parents: ReadonlySet<string>,
): Problem | undefined {
  const kind = registry.kinds.find(({ id }) => id === draft.kind);
  if (kind === undefined) return problem('unknown_kind', draft.kind);
  const territory = territories.find(({ id }) => id === draft.territory);
  if (territory === undefined) return problem('unknown_territory', draft.territory);
  if (draft.class_required !== undefined && !kind.classes_allowed.includes(draft.class_required))
    return problem('class_not_allowed', draft.class_required);
  const tag = draft.tags.find((id) => !registry.tags.some((known) => known.id === id));
  if (tag !== undefined) return problem('unknown_tag', tag);
  const script = scriptProblem(draft, kind, registry.scripts);
  if (script !== undefined) return script;
  const secret = draft.secrets_required.find((name) => !territory.secrets_allowed.includes(name));
  if (secret !== undefined) return problem('secret_not_allowed', secret);
  if (draft.party_role === 'part') return problem('party_part');
  return tooLong(draft, kind, parents, budget) ?? templateProblem(draft, territory);
}

/** The drafts this one cannot exist without. */
const needs = (draft: QuestDraft): string[] => [
  ...draft.depends_on_refs,
  ...(draft.parent_ref === undefined ? [] : [draft.parent_ref]),
];

const dropOf = (draft: QuestDraft, why: Problem): DroppedDraft => ({
  ref: draft.ref,
  title: draft.title,
  ...why,
});

/** Drops what waits on a dropped draft, until nothing more falls (at most one round per draft). */
function withoutOrphans(drafts: readonly QuestDraft[], dropped: DroppedDraft[]): readonly QuestDraft[] {
  const gone = new Set(dropped.map(({ ref }) => ref));
  const orphans = drafts.flatMap((draft) => {
    const missing = needs(draft).find((ref) => gone.has(ref));
    return missing === undefined ? [] : [dropOf(draft, problem('needs_dropped_draft', missing))];
  });
  if (orphans.length === 0) return drafts;
  dropped.push(...orphans);
  return withoutOrphans(
    drafts.filter((draft) => !orphans.some(({ ref }) => ref === draft.ref)),
    dropped,
  );
}

/** Each draft after what it needs; drafts that wait on each other in a circle are dropped. */
function ordered(drafts: readonly QuestDraft[], dropped: DroppedDraft[]): QuestDraft[] {
  const placed: QuestDraft[] = [];
  let rest = [...drafts];
  for (let pass = 0; pass < drafts.length && rest.length > 0; pass += 1) {
    const done = new Set(placed.map(({ ref }) => ref));
    const ready = rest.filter((draft) => needs(draft).every((ref) => done.has(ref)));
    placed.push(...ready);
    rest = rest.filter((draft) => !ready.includes(draft));
  }
  dropped.push(...rest.map((draft) => dropOf(draft, problem('dependency_cycle'))));
  return placed;
}

/**
 * The drafts the kingdom can take, in order, and those it cannot, with why. `brief` (PS-06): the reply's, which the
 * council rule reads with `context.council`.
 */
export function screenDrafts(
  drafts: readonly QuestDraft[],
  context: ScreenContext,
  brief?: Brief,
): ScreenedDrafts {
  const dropped: DroppedDraft[] = [];
  const parents = new Set(drafts.flatMap(({ parent_ref: parent }) => (parent === undefined ? [] : [parent])));
  const council = councilDrops(drafts, context, brief);
  const known = drafts.filter((draft) => {
    const own = problemOf(draft, context, parents);
    const rule = council.get(draft.ref);
    const found = own ?? (rule === undefined ? undefined : problem(rule));
    if (found !== undefined) dropped.push(dropOf(draft, found));
    return found === undefined;
  });
  const kept = ordered(withoutOrphans(known, dropped), dropped);
  return { kept, dropped };
}
