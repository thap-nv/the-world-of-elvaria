// The runs of a probe (CM-04, ADR 0032): the domain's plan asks for one commit at a time (probeNextOf), each tried in
// the plot `probe-<id>` (Plots.probe) with the red checks only, and step 4 on a quest's own head (questHeadOf). Shared by
// the patrol's probe of its base branch (probe.ts) and (CM-08b) the probe of a red delivery train (forge/train-probe.ts),
// whose steps are the train's own merge commits: commits no branch names once its plot went, still in the repo's objects.
import { probeChecksOf, probeNextOf, probeRunOf, questHeadOf } from '@elvaria/domain';
import type { ProbeDone, ProbeMove, ProbePlan, ProbeRun, QuestStep, Territory } from '@elvaria/domain';

import type { Plots } from '../types.ts';

export type ProbePlots = Required<Pick<Plots, 'probe' | 'commitLinks'>>;

export interface Probe {
  readonly plots: ProbePlots;
  readonly territory: Territory;
  /** The red checks; those the plot runs leave commands.setup out, which always runs. */
  readonly checks: readonly string[];
  readonly signal: AbortSignal;
}

/** What the probe ran and concluded. */
export interface Probed {
  readonly runs: readonly ProbeRun[];
  readonly done: ProbeDone;
}

/** The plots a probe runs in; undefined when this Steward has none. */
export function probePlotsOf(plots: Plots): ProbePlots | undefined {
  const probe = plots.probe?.bind(plots);
  const commitLinks = plots.commitLinks?.bind(plots);
  return probe === undefined || commitLinks === undefined ? undefined : { probe, commitLinks };
}

async function runAt(probe: Probe, commit: string, step?: QuestStep): Promise<ProbeRun> {
  const { plots, territory, checks, signal } = probe;
  const trial = await plots.probe(territory, commit, probeChecksOf(checks), signal);
  return probeRunOf(trial, commit, step?.quest);
}

/** Step 4: the quest's own head before its newest merge of the base branch; a run that cannot say when git cannot. */
async function ownRun(probe: Probe, step: QuestStep): Promise<ProbeRun> {
  const links =
    step.parent === undefined
      ? undefined
      : await probe.plots.commitLinks(probe.territory, step.head, step.parent);
  if (links === undefined) return { commit: step.head, quest: step.quest, red: undefined, duration_ms: 0 };
  return runAt(probe, questHeadOf(links, step.head), step);
}

const runOf = (probe: Probe, move: Exclude<ProbeMove, ProbeDone>): Promise<ProbeRun> =>
  move.kind === 'own' ? ownRun(probe, move.step) : runAt(probe, move.commit);

/** The plan's moves, one run at a time; undefined once the Steward stopped (read after each await). */
export async function probeFrom(
  probe: Probe,
  plan: ProbePlan,
  runs: readonly ProbeRun[],
): Promise<Probed | undefined> {
  const move = probeNextOf(plan, runs);
  if (move.kind === 'done') return { runs, done: move };
  const run = await runOf(probe, move);
  if (probe.signal.aborted) return undefined;
  return probeFrom(probe, plan, [...runs, run]);
}
