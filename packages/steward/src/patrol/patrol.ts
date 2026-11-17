// The patrol (PS-26, implementation-plan §3.16.7): a scheduled job outside the tick (kingdom.schedule.patrol, before
// the triage and the digest), with no model and no mana. For each git territory with `patrol`, one after another:
// commands.setup and every check on a clean plot at the head of its default branch, then its scans in that plot
// (Plots.patrol: runner-core's tryTerritory under `patrol-<id>`), and one `patrol.ran`. stepPatrol says which checks
// turned red: for them the draft quest of `patrol.follow_up` (before the line, so a patrol stopped between them finds
// the check turned red again), and one ring. A `territory.health` line beside it lets the world draw the branch's
// health; territory.json is not written. A territory whose plot cannot be made, or whose run throws, does not hold the
// next one back. The Steward's stop kills the run and records nothing of it: no `schedule.ran`, it runs again at the
// next start.
import { healthOf, patrolLedgerOf, patrolRanOf, stepPatrol, territoryViewOf } from '@elvaria/domain';
import type { PatrolLedger, PatrolRanData, RedCheck, Territory } from '@elvaria/domain';

import { ring } from '../context.ts';
import { STEWARD } from '../record.ts';
import { openPatrolDraft } from './draft.ts';
import { scansIn } from './scans.ts';
import type { Context } from '../context.ts';
import type { StewardJob } from '../schedule/scheduler.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The territories the patrol watches, by id: git, with `patrol`. */
const patrolledOf = (ctx: Context): Territory[] =>
  [...ctx.world.territories.values()]
    .filter(({ vcs, patrol }) => vcs.type === 'git' && patrol !== undefined)
    .sort((a, b) => a.id.localeCompare(b.id));

/** One territory's run, or undefined when it threw or the Steward stopped under it. */
async function patrolOne(ctx: Context, territory: Territory, signal: AbortSignal) {
  const { plots } = ctx.deps;
  if (plots.patrol === undefined) return undefined;
  let scans: PatrolRanData['scans'] = [];
  try {
    const trial = await plots.patrol(territory, {
      signal,
      scan: async (cwd) => {
        scans = await scansIn(ctx, territory, cwd, signal);
      },
    });
    if (signal.aborted) return undefined;
    return patrolRanOf({ territory: territory.id, trigger: 'schedule', trial, scans });
  } catch (error) {
    if (!signal.aborted) ctx.deps.log.warn(`steward: patrol of ${territory.id} failed: ${messageOf(error)}`);
    return undefined;
  }
}

/** The world's view of the territory's health after the run: red while a check is, unknown without a plot. */
function healthLine(territory: Territory, data: PatrolRanData, red: readonly RedCheck[], ts: string) {
  const ci = red.length > 0 ? 'red' : data.plot_failure === undefined ? 'green' : 'unknown';
  const health = { ...territory.health, ci, last_patrol_at: ts } as const;
  return { territory: territoryViewOf({ ...territory, health }) };
}

async function record(ctx: Context, ledger: PatrolLedger, territory: Territory, data: PatrolRanData) {
  const ts = ctx.record.stamp();
  const step = stepPatrol(ledger, ts, data);
  const turned = step.turned_red;
  const draft = turned.length === 0 ? undefined : await openPatrolDraft(ctx, territory, turned);
  const red = step.ledger.watches[territory.id]?.health.red ?? [];
  await ctx.record.note({ type: 'patrol.ran', actor: STEWARD, territory: territory.id, data });
  const view = healthLine(territory, data, red, ts);
  await ctx.record.note({ type: 'territory.health', actor: STEWARD, territory: territory.id, data: view });
  if (turned.length > 0) {
    const checks = turned.map(({ check, error_line: line }) => ({
      check,
      ...(line === undefined ? {} : { error_line: line }),
    }));
    await ring(ctx, {
      kind: 'base_red',
      territory: territory.id,
      checks,
      ...(draft === undefined ? {} : { draft }),
    });
  }
  return step.ledger;
}

export const patrolJob = (): StewardJob => ({
  id: 'patrol',
  mode: 'off_tick',
  run: async (ctx, run) => {
    // The merges since each check's last green patrol are the suspects of a check that turns red: the whole log.
    let ledger = patrolLedgerOf((await ctx.deps.events.read()).events);
    for (const territory of patrolledOf(ctx)) {
      if (run.signal.aborted) return;
      const data = await patrolOne(ctx, territory, run.signal);
      if (data !== undefined) ledger = await record(ctx, ledger, territory, data);
    }
    ctx.patrol.health = healthOf(ledger);
  },
});
