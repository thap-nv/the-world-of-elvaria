// Protected paths (implementation-plan §3.16.4, ADR 0026, PS-04): what guards the world (its rules, checks, judges and
// measures) is data of the territory, `laws.protected_paths`. A quest whose work changes one is never refused, as a
// forbidden path is: it waits for the royal seal whatever its kind's `seal_default`, and gets the stronger judge
// (wantsStrongJudge). The Steward reads the plot's changes at each submit and sets both through `Move.before`, since
// seal_required is read only when a verdict passes: the state machine does not change. A part of a party keeps the
// mark, and so the stronger judge, but not the seal: its branch reaches the base only through the party's merge quest,
// which always waits for it (the owner's settlement of PS-04 (a), 2026-11-13).
import type { Quest } from '../schema/quest/quest.ts';
import type { PartyRole } from '../schema/quest/shared.ts';
import type { Territory } from '../schema/territory.ts';

/** The territory's protected globs; none for a territory that names none, or one the Steward does not know. */
export const protectedPathsOf = (territory: Pick<Territory, 'laws'> | undefined): readonly string[] =>
  territory?.laws.protected_paths ?? [];

/** Whether the quest's work has changed a protected path at one of its submits. */
export const touchesProtected = (quest: Pick<Quest, 'protected_changes'>): boolean =>
  (quest.protected_changes ?? []).length > 0;

/**
 * The places in a party whose work is merged into the merge quest, never delivered alone; that quest is made with
 * seal_required (party/merge-quest.ts), so a seal on each of them would only make the owner seal the same change twice.
 */
const MERGED_LATER: ReadonlySet<PartyRole> = new Set(['part', 'acceptance']);

/** What a submit that changed protected paths sets on a quest: the paths, and the seal but on a part of a party. */
export type ProtectedMark = Pick<Quest, 'protected_changes'> & { readonly seal_required?: true };

/**
 * What a submit sets on `quest` when its work changed the protected paths `changed`: the seal, and those paths after
 * the ones its earlier submits changed; for a part of a party, the paths alone. Nothing when it changed none: a mark
 * once set stays, as the machine never lowers seal_required (quest/effects.ts), and a seal asked for in error costs
 * the owner one look.
 */
export function protectedMarkOf(
  quest: Pick<Quest, 'protected_changes' | 'party_role'>,
  changed: readonly string[],
): ProtectedMark | undefined {
  if (changed.length === 0) return undefined;
  const gathered = [...new Set([...(quest.protected_changes ?? []), ...changed])];
  if (quest.party_role !== undefined && MERGED_LATER.has(quest.party_role))
    return { protected_changes: gathered };
  return { seal_required: true, protected_changes: gathered };
}
