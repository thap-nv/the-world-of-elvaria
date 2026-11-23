// The probe's plan (CM-04, ADR 0032, plans/check-modes.md "Tuần tra sau mỗi merge và phép dò"), pure and replayed from
// the runs so far: the Steward asks for the next move, runs it, and asks again. (1) Binary search of the first red step
// between the green head (green) and the red head (red, as the patrol found it); (2) that step's checks again: green
// now ⇒ `flaky`; (3) a step that is no quest's merge ⇒ `outside`; (4) the quest's own head before its newest merge of
// the base branch: red ⇒ `own_change`, green ⇒ `combination`. A run that could not say (timed out, no plot) ⇒ `unknown`,
// as is a probe that would need more than PROBE_RUNS_MAX runs. No step at all (the green head is the red one) ⇒ `flaky`.
import { PROBE_RUNS_AFTER_SEARCH, PROBE_RUNS_MAX, PROBE_SPLIT } from './constants.ts';
import type { QuestId } from '../core/ids.ts';
import type { CheckCause } from '../schema/event/check-data.ts';
import type { ProbeStep } from './probe-steps.ts';

/** One run of the red checks on one commit: red, green, or undefined when it could not say. */
export interface ProbeRun {
  readonly commit: string;
  /** The quest whose own head this run tried (step 4). */
  readonly quest?: QuestId;
  readonly red: boolean | undefined;
  readonly duration_ms: number;
}

export interface ProbePlan {
  /** The red head the patrol tried. */
  readonly red: string;
  /** From the green head (excluded) to the red head, oldest first (probeStepsOf). */
  readonly steps: readonly ProbeStep[];
}

/** A quest's merge: the step 4 runs on its own head, which the Steward reads from git (questHeadOf). */
export type QuestStep = ProbeStep & { readonly quest: QuestId; readonly head: string };

export interface ProbeDone {
  readonly kind: 'done';
  readonly cause: CheckCause;
  /** The first red step, once found. */
  readonly commit?: string;
  readonly culprit?: QuestId;
}

export type ProbeMove =
  | { readonly kind: 'run'; readonly commit: string }
  | { readonly kind: 'own'; readonly step: QuestStep }
  | ProbeDone;

const unknown = (step?: ProbeStep): ProbeDone => ({
  kind: 'done',
  cause: 'unknown',
  ...(step === undefined ? {} : { commit: step.commit }),
});

/** The runs a binary search between two bounds `gap` apart still needs. */
const depthOf = (gap: number): number => Math.ceil(Math.log2(gap));

const isQuestStep = (step: ProbeStep): step is QuestStep =>
  step.quest !== undefined && step.head !== undefined;

/** After the first red step is found: its rerun, then the quest's own head. */
function afterSearch(step: ProbeStep, runs: readonly ProbeRun[], at: number): ProbeMove {
  const again = runs[at];
  // The search kept two runs for these (probeNextOf).
  if (again === undefined) return { kind: 'run', commit: step.commit };
  if (again.red === undefined) return unknown(step);
  if (!again.red) return { kind: 'done', cause: 'flaky', commit: step.commit };
  if (!isQuestStep(step)) return { kind: 'done', cause: 'outside', commit: step.commit };
  const own = runs[at + 1];
  if (own === undefined) return { kind: 'own', step };
  if (own.red === undefined) return unknown(step);
  const cause = own.red ? 'own_change' : 'combination';
  return { kind: 'done', cause, commit: step.commit, culprit: step.quest };
}

/**
 * The next move of the probe of `plan` after `runs`, in the order this function asked for them; a run of the search on
 * another commit than the one asked (the runs of another plan) ⇒ `unknown`.
 */
export function probeNextOf(plan: ProbePlan, runs: readonly ProbeRun[]): ProbeMove {
  const { steps } = plan;
  let found = steps.at(-1);
  if (found === undefined) return { kind: 'done', cause: 'flaky', commit: plan.red };
  // Index -1 is the green head; the last step is the red head, red by the patrol.
  let green = -1;
  let red = steps.length - 1;
  let at = 0;
  while (red - green > 1) {
    const middle = Math.floor((green + red) / PROBE_SPLIT);
    const asked = steps[middle];
    const run = runs[at];
    if (asked === undefined || (run !== undefined && run.commit !== asked.commit)) return unknown();
    if (run === undefined)
      return at + depthOf(red - green) + PROBE_RUNS_AFTER_SEARCH <= PROBE_RUNS_MAX
        ? { kind: 'run', commit: asked.commit }
        : unknown();
    if (run.red === undefined) return unknown();
    if (run.red) [red, found] = [middle, asked];
    else green = middle;
    at += 1;
  }
  return afterSearch(found, runs, at);
}
