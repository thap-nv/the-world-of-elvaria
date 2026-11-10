// What a judge's pass must show before the Steward takes it (implementation-plan §3.2, §3.15, ADR 0022; P1-40).
// In the P1-35 run an agy judge handed in `pass` with no notes and had broken nothing in its scratch plot: its shell
// could not run pnpm, and the Steward took the verdict as it came. A pass now says in its notes what the judge
// checked; in a scratch plot whose ritual breaks code it also names its breaks and the red runs they caused, else
// it is taken as partial, and the next judge reads on from the step it skipped. The schema leaves both to the
// Steward, so verdict files written before stay valid.
import { MIN_BREAKS } from '../constants.ts';
import { judgedInScratch, ritualOf } from './ritual-of.ts';
import { partialVerdictIdOf, verifierSessionsOf } from './verdict-id.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Verdict } from '../schema/quest/verdict.ts';
import type { Registry } from '../schema/registry.ts';

/** The ritual step that breaks code on purpose and expects red (RITUAL_STEPS). */
export const BREAK_STEP = 'break_and_expect_red';

/** What a judge's pass without notes is told, in the `path: message` form of the schema's issues. */
export const PASS_NOTES_ISSUE = 'notes: a pass says what the judge checked; a pass without notes is refused';

/** A judge's pass whose notes say nothing: the Steward takes no such verdict (P1-35 (f)). */
export const passWithoutNotes = (verdict: Pick<Verdict, 'result' | 'notes'>): boolean =>
  verdict.result === 'pass' && (verdict.notes ?? '').trim() === '';

/**
 * The quest's judge must show its breaks: it works in a scratch plot (judgedInScratch), where it may edit, and its
 * ritual has the step that breaks code. A scratch ritual without that step asks for no break.
 */
export function breaksDue(
  quest: Pick<Quest, 'kind' | 'tags' | 'party_role' | 'plot'>,
  registry: Pick<Registry, 'kinds' | 'rituals'>,
): boolean {
  const steps = ritualOf(quest, registry)?.steps ?? [];
  return judgedInScratch(quest, registry) && steps.some((step) => step === BREAK_STEP);
}

/**
 * A judge's verdict, after the pass rule, with its breaks weighed: a pass that is due breaks and names fewer than
 * MIN_BREAKS becomes the partial verdict of this verifier session (`-p<k>`), stopped at BREAK_STEP. Any other verdict
 * is returned as it is: a fail or a partial says why on its own, and the machine's overruled pass is already a fail.
 */
export function withBreaksWeighed(
  verdict: Verdict,
  quest: Pick<Quest, 'id' | 'kind' | 'tags' | 'party_role' | 'plot' | 'attempt_log'>,
  registry: Pick<Registry, 'kinds' | 'rituals'>,
): Verdict {
  if (verdict.result !== 'pass' || !breaksDue(quest, registry)) return verdict;
  if ((verdict.breaks ?? []).length >= MIN_BREAKS) return verdict;
  const n = verdict.attempt;
  return {
    ...verdict,
    id: partialVerdictIdOf(quest, n, verifierSessionsOf(quest, n)),
    result: 'partial',
    progress: { checked_until: BREAK_STEP },
  };
}
