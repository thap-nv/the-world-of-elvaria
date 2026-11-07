// What the Chancellor drafted, held against the kingdom's files (implementation-plan §3.11, ADR 0013, 0016): the
// quest-draft schema checks shapes, not whether a tag, kind or secret exists. A draft that names something the
// kingdom does not have is dropped here, with its reason, instead of being refused by the Steward one tick later;
// so is every draft that waits on a dropped one. The rest come back in an order where each follows what it names.
import type { QuestDraft, Registry, Territory } from '@elvaria/domain';

export const DROP_REASONS = [
  'unknown_kind',
  'unknown_territory',
  'class_not_allowed',
  // Tags are a closed vocabulary (registry/tags.json), so reputation per tag does not splinter (§9.1 item 21).
  'unknown_tag',
  'unknown_script',
  'script_not_for_kind',
  // The Chancellor cannot add secrets: only names the territory allows reach a session (ADR 0013).
  'secret_not_allowed',
  // Parts come from the party lead's output once the contract exists, never from the Chancellor (§3.13).
  'party_part',
  'needs_dropped_draft',
  'dependency_cycle',
] as const;
export type DropReason = (typeof DROP_REASONS)[number];

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
  readonly territories: readonly Pick<Territory, 'id' | 'secrets_allowed'>[];
}

type Problem = Pick<DroppedDraft, 'reason' | 'detail'>;

const problem = (reason: DropReason, detail?: string): Problem =>
  detail === undefined ? { reason } : { reason, detail };

/** The first thing the draft names that the kingdom does not have, if any. */
function problemOf(draft: QuestDraft, { registry, territories }: ScreenContext): Problem | undefined {
  const kind = registry.kinds.find(({ id }) => id === draft.kind);
  if (kind === undefined) return problem('unknown_kind', draft.kind);
  const territory = territories.find(({ id }) => id === draft.territory);
  if (territory === undefined) return problem('unknown_territory', draft.territory);
  if (draft.class_required !== undefined && !kind.classes_allowed.includes(draft.class_required))
    return problem('class_not_allowed', draft.class_required);
  const tag = draft.tags.find((id) => !registry.tags.some((known) => known.id === id));
  if (tag !== undefined) return problem('unknown_tag', tag);
  if (draft.script !== undefined) {
    const script = registry.scripts.find(({ id }) => id === draft.script?.id);
    if (script === undefined) return problem('unknown_script', draft.script.id);
    if (!script.kinds.includes(kind.id)) return problem('script_not_for_kind', script.id);
  }
  const secret = draft.secrets_required.find((name) => !territory.secrets_allowed.includes(name));
  if (secret !== undefined) return problem('secret_not_allowed', secret);
  return draft.party_role === 'part' ? problem('party_part') : undefined;
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

export function screenDrafts(drafts: readonly QuestDraft[], context: ScreenContext): ScreenedDrafts {
  const dropped: DroppedDraft[] = [];
  const known = drafts.filter((draft) => {
    const found = problemOf(draft, context);
    if (found !== undefined) dropped.push(dropOf(draft, found));
    return found === undefined;
  });
  const kept = ordered(withoutOrphans(known, dropped), dropped);
  return { kept, dropped };
}
