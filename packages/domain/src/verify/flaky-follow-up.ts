// The quest that exorcises a flaky check (product plan 0.7 §5 "flaky → không qua và tự sinh quest Trừ tà"; P1-20):
// a verdict that fails as `flaky`, or whose `flake_check` failed, opens one session quest of the kind and class its
// ritual names (`flaky_follow_up`), so no kind is switched on here (ADR 0016). The quest judged goes back to its
// assignee as any failed quest does; this one hunts the flake, which may lie in tests the default branch had already.
import { clipTitle } from '../script/follow-up.ts';
import { FLAKE_CHECK_ID } from './pass-rule.ts';
import type { CommandPayload } from '../schema/command/inbox-command.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Verdict } from '../schema/quest/verdict.ts';
import type { Registry } from '../schema/registry.ts';
import type { Ritual } from '../schema/registry-entries.ts';

export interface FlakyVerdict {
  /** The quest whose verdict found the flake. */
  readonly parent: Quest;
  readonly ritual: Ritual;
  readonly kinds: Registry['kinds'];
  readonly verdict: Pick<Verdict, 'result' | 'fail_kind' | 'checks' | 'notes' | 'attempt'>;
  /** `kingdom.owner.locale`: the title names the follow-up's kind in the owner's language. */
  readonly locale: Kingdom['owner']['locale'];
}

/** A fail that found a flake: the machine's `flake_check` failed, or the judge said `flaky`. */
export const isFlaky = (verdict: FlakyVerdict['verdict']): boolean =>
  verdict.result === 'fail' &&
  (verdict.fail_kind === 'flaky' || verdict.checks.some(({ id, pass }) => id === FLAKE_CHECK_ID && !pass));

/**
 * The `create_quest` payload of the follow-up, or undefined when the verdict found no flake or the ritual names no
 * follow-up. Open at once, a child of the quest judged, on its territory, rank, tags and scope (PS-05: it waits until
 * the quest judged is archived when that one holds its scope); the Steward makes it through `questFromCommand`, so
 * the kingdom's rules hold.
 */
export function flakyFollowUpOf(run: FlakyVerdict): CommandPayload<'create_quest'> | undefined {
  const { parent, ritual, verdict, locale } = run;
  const followUp = ritual.flaky_follow_up;
  if (followUp === undefined || !isFlaky(verdict)) return undefined;
  const kind = run.kinds.find(({ id }) => id === followUp.kind);
  if (kind === undefined) return undefined;
  const name = locale === 'vi' ? kind.name_vi : kind.name_en;
  const description = [
    `While judging quest ${parent.id} («${parent.title}», run ${verdict.attempt}), the machine ran its checks again on the same commit and some passed once and failed another time. Find why they flake and make them deterministic. The flake may lie in the tests the quest adds on its branch quest/${parent.id}, not merged yet, or in tests the default branch already has. The verdict's notes follow.`,
    verdict.notes ?? '',
  ]
    .filter((part) => part !== '')
    .join('\n\n');
  return {
    draft: false,
    title: clipTitle(`${name}: ${parent.title}`),
    description,
    kind: followUp.kind,
    rank: parent.rank,
    territory: parent.territory,
    tier: 'session',
    class_required: followUp.class,
    tags: [...parent.tags],
    ...(parent.scope_paths === undefined ? {} : { scope_paths: parent.scope_paths }),
    parent_id: parent.id,
    // What the machine finds while it watches the walls: the Steward opens it, as a patrol's finding.
    created_by: 'patrol',
  };
}
