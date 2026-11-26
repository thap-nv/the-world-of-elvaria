// The Steward's side of the check ledger (RC-04, ADR 0035, plans/recheck.md §2.1–2.2). The ledger is a pure function
// of the log (checkLedgerOf), read anew before each run that asks it, so a Steward that restarts keeps it; carryOf and
// patrolCarryOf decide what runs, the Steward only acts on it. Every run of the checks names, on its line, the tree it
// ran on, the territory's check config and a narrow run's base (factsOf): green, it is a fact the next run on the same
// tree carries. No tree (uncommitted changes, no git) is no fact and carries nothing.
import { carryOf, checkLedgerOf, patrolCarryOf } from '@elvaria/domain';
import { checkConfigOf } from '@elvaria/runner-core';
import type {
  CarriedCheck,
  Carry,
  CarryRequest,
  PatrolTrigger,
  Quest,
  Territory,
  Ulid,
} from '@elvaria/domain';
import type { CheckPoint, CheckRunMode } from '@elvaria/runner-core';

import type { Context } from '../context.ts';

/** What a run in the quest's plot is a fact about (Plots.checkPoint); none when Plots cannot say: no carry, no fact. */
export async function checkPointOf(
  ctx: Context,
  quest: Quest,
  mode: CheckRunMode | undefined,
): Promise<CheckPoint | undefined> {
  try {
    return await ctx.deps.plots.checkPoint?.(quest.plot, mode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.deps.log.warn(`steward: ${quest.id}: no tree for its checks: ${message}`);
    return undefined;
  }
}

/** What a line of the checks says they ran on: the tree, the config, a narrow run's base; nothing without a tree. */
export function factsOf(territory: Territory, point: CheckPoint | undefined): Record<string, string> {
  if (point?.tree === undefined) return {};
  const base = point.base === undefined ? {} : { base: point.base };
  return { tree: point.tree, config: checkConfigOf(territory), ...base };
}

async function requestOf(ctx: Context, territory: Territory, tree: string, base?: string) {
  const ledger = checkLedgerOf((await ctx.deps.events.read()).events);
  const request: CarryRequest = {
    territory: territory.id,
    tree,
    config: checkConfigOf(territory),
    checks: territory.checks,
    ...(base === undefined ? {} : { base }),
    now: ctx.deps.clock.now(),
  };
  return { ledger, request };
}

/** The checks of `territory` to carry on `point`, as the queue, a guest's try and a trial merge ask: none without a tree. */
export async function carriedFor(
  ctx: Context,
  territory: Territory,
  point: CheckPoint | undefined,
): Promise<readonly CarriedCheck[]> {
  if (point?.tree === undefined) return [];
  const { ledger, request } = await requestOf(ctx, territory, point.tree, point.base);
  return carryOf(ledger, request).carried;
}

/** What a patrol by `trigger` runs and carries on the tree of the commit it would try (K4: the owner's runs all). */
export async function patrolCarryFor(
  ctx: Context,
  territory: Territory,
  tree: string,
  trigger: PatrolTrigger,
): Promise<Carry> {
  const { ledger, request } = await requestOf(ctx, territory, tree);
  return patrolCarryOf(ledger, request, trigger);
}

/** The checks of a run as `check.end` writes them: a carried one names the line it stands for. */
export const endChecksOf = (
  runs: readonly { id: string; pass: boolean; duration_ms: number; carried_from?: Ulid | undefined }[],
) =>
  runs.map(({ id, pass, duration_ms, carried_from: from }) => ({
    id,
    pass,
    duration_ms,
    ...(from === undefined ? {} : { carried_from: from }),
  }));

/** A check that failed for its environment (environmentFailureOf): `check.end` names it and the line that said so. */
interface Environment {
  readonly check: string;
  readonly line: string;
}

/** What `check.end` says of checks that ran to their end: pass or fail, each check, the environment that failed. */
export const ranEndOf = (runs: Parameters<typeof endChecksOf>[0], environment: Environment | undefined) => ({
  outcome: runs.every(({ pass }) => pass) ? ('pass' as const) : ('fail' as const),
  checks: endChecksOf(runs),
  ...(environment === undefined ? {} : { environment: { check: environment.check, line: environment.line } }),
});
