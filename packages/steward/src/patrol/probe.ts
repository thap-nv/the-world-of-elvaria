// The probe after a red patrol (CM-04, ADR 0032, plans/check-modes.md "Tuần tra sau mỗi merge và phép dò"): 0 mana,
// the red checks only. In the territory's patrol lane, the red checks no probe has attributed yet: the steps from the
// latest patrol that found them green to the head the patrol found them red at (Plots.commitLinks, probeStepsOf), each
// merge named by its quest from the log, then the runs the domain's plan asks for (probeNextOf) in a plot `probe-<id>`
// (Plots.probe), and one `check.attributed`, which the book's health and the digest's `base_red` item carry. (CM-06)
// Before that line, a conclusion that blames a merged quest writes its late verdict and opens its fix quest
// (late-fix.ts). The Steward's stop kills the run and its plot goes, nothing is recorded: the red checks stay
// unattributed and the territory's next patrol probes them again.
import {
  attributedHealth,
  attributionOf,
  greenHeadOf,
  probeChecksOf,
  probeNextOf,
  probeRunOf,
  probeStepsOf,
  questHeadOf,
  questTipsOf,
  unattributedOf,
} from '@elvaria/domain';
import type { ProbeDone, ProbeMove, ProbePlan, ProbeRun, QuestStep, Territory } from '@elvaria/domain';

import { STEWARD } from '../quest/record.ts';
import { setHealth } from './book.ts';
import { lateFixAfter } from './late-fix.ts';
import type { Context } from '../context.ts';
import type { Plots } from '../types.ts';

type ProbePlots = Required<Pick<Plots, 'probe' | 'commitLinks'>>;

interface Probe {
  readonly plots: ProbePlots;
  readonly territory: Territory;
  /** The red checks; those the plot runs leave commands.setup out, which always runs. */
  readonly checks: readonly string[];
  readonly signal: AbortSignal;
}

/** Read each time: the Steward may stop during any await. */
const stopped = ({ signal }: Probe): boolean => signal.aborted;

const UNKNOWN: ProbeDone = { kind: 'done', cause: 'unknown' };
const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const healthOf = (ctx: Context, territory: Territory) =>
  ctx.patrol.health.find((watch) => watch.territory === territory.id);

/** The steps from the green head to the red one; undefined when there is no green head or git cannot say. */
async function planOf(ctx: Context, probe: Probe): Promise<ProbePlan | undefined> {
  const { plots, territory, checks } = probe;
  const red = healthOf(ctx, territory)?.head ?? null;
  const events = (await ctx.deps.events.read()).events;
  const green = greenHeadOf(events, territory.id, checks);
  if (red === null || green === undefined) return undefined;
  const links = await plots.commitLinks(territory, red, green);
  if (links === undefined) return undefined;
  const steps = probeStepsOf(links, { green, red }, questTipsOf(events, territory.id));
  return steps === undefined ? undefined : { red, steps };
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

/** The plan's moves, one run at a time; undefined once the Steward stopped. */
async function probeFrom(probe: Probe, plan: ProbePlan, runs: readonly ProbeRun[]) {
  const move = probeNextOf(plan, runs);
  if (move.kind === 'done') return { runs, done: move };
  const run = await runOf(probe, move);
  if (stopped(probe)) return undefined;
  return probeFrom(probe, plan, [...runs, run]);
}

async function attribute(ctx: Context, probe: Probe): Promise<void> {
  if (stopped(probe)) return;
  const plan = await planOf(ctx, probe);
  const probed = plan === undefined ? { runs: [], done: UNKNOWN } : await probeFrom(probe, plan, []);
  // The plan's last read and the line: a stop between them records nothing.
  if (probed === undefined || stopped(probe)) return;
  const { territory, checks } = probe;
  const data = attributionOf({ territory: territory.id, source: 'patrol', checks, ...probed });
  // First, so a stop before the line leaves the checks to the next probe, which finds what this wrote.
  await lateFixAfter(ctx, territory, data, healthOf(ctx, territory)?.red ?? []);
  await ctx.record.note({ type: 'check.attributed', actor: STEWARD, territory: territory.id, data });
  const health = healthOf(ctx, territory);
  if (health !== undefined) setHealth(ctx.patrol, territory.id, attributedHealth(health, data));
}

/** Whether `territory` has red checks no probe attributed, and the plots to probe them. */
export const probeDue = (ctx: Context, territory: Territory): boolean =>
  ctx.deps.plots.probe !== undefined && unattributedOf(healthOf(ctx, territory)).length > 0;

/** The probe of `territory`'s unattributed red checks in its lane; nothing when there are none, or once stopped. */
export function probeTerritory(ctx: Context, territory: Territory, signal: AbortSignal): Promise<void> {
  const { plots } = ctx.deps;
  const probe = plots.probe?.bind(plots);
  const commitLinks = plots.commitLinks?.bind(plots);
  if (probe === undefined || commitLinks === undefined) return Promise.resolve();
  return ctx.patrol.runs.exclusive(territory.id, async () => {
    const checks = unattributedOf(healthOf(ctx, territory));
    if (checks.length === 0) return;
    try {
      await attribute(ctx, { plots: { probe, commitLinks }, territory, checks, signal });
    } catch (error) {
      if (!signal.aborted) ctx.deps.log.warn(`steward: probe of ${territory.id} failed: ${messageOf(error)}`);
    }
  });
}
