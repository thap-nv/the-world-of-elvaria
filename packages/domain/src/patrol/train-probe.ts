// The probe of a red delivery train (CM-08b, ADR 0032, plans/check-modes.md "Tàu giao hàng của `deferred`", "Đỏ"): the
// patrol's plan (probe.ts) over the train's own merge commits instead of the base branch's first parents. The train is
// cut from a base branch the territory holds green, so its base is the green end and its head the red one, and each
// step is one quest's merge: a train's probe finds no `outside` step. The generators' commit, when the train made one,
// is part of the last quest's step (the train's head is that step's commit), so every step still names a quest. Then
// who leaves how: the quest at the first red step is blamed (`own_change`, a late verdict, ADR 0033) or sent to a merge
// quest (`combination`); the quests before it, green in the search, leave at once as a new train; those after it wait
// on the platform for the next one, which finds the next red quest if there is one.
import type { QuestId } from '../core/ids.ts';
import type { ProbeDone, ProbePlan } from './probe.ts';
import type { ProbeStep } from './probe-steps.ts';

/** A quest merged into the train: the train's merge `commit`, and the quest branch's `head` it merged. */
export interface TrainProbeStep {
  readonly quest: QuestId;
  readonly commit: string;
  readonly head: string;
}

export interface TrainProbeInput {
  /** The base branch's head the train was cut from. */
  readonly base: string;
  /** The train's head, red: its last merge, or the generators' commit on top of it. */
  readonly head: string;
  /** The quests merged, in order. */
  readonly steps: readonly TrainProbeStep[];
}

/** The probe's plan over the train's merges: each step's `parent` is the merge before it, or the base for the first. */
export function trainProbePlanOf({ base, head, steps }: TrainProbeInput): ProbePlan {
  const last = steps.length - 1;
  return {
    red: head,
    steps: steps.map((step, at): ProbeStep => ({
      commit: at === last ? head : step.commit,
      parent: steps[at - 1]?.commit ?? base,
      quest: step.quest,
      head: step.head,
    })),
  };
}

/** Who leaves a red train how, once probed. */
export interface TrainSplit {
  /** The quest whose merge first turned the checks red (own_change, combination). */
  readonly culprit?: QuestId;
  /** The quests merged before it, green in the search: a new train (`split`) at once. */
  readonly before: readonly QuestId[];
  /** The quests merged after it, or every quest when the probe blamed none: back to the platform. */
  readonly after: readonly QuestId[];
}

/** The split of a train whose `quests` merged in that order, by the probe's conclusion. */
export function trainSplitOf(done: ProbeDone, quests: readonly QuestId[]): TrainSplit {
  const { culprit } = done;
  const at = culprit === undefined ? -1 : quests.indexOf(culprit);
  if (culprit === undefined || at < 0) return { before: [], after: [...quests] };
  return { culprit, before: quests.slice(0, at), after: quests.slice(at + 1) };
}
