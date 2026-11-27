// One run of the machine checks of a submitted run in the quest's plot (P1-25, P1-10b), between its `check.start` and
// `check.end` lines: the check mode (CM-01), the head they ran on (P1-38), the tree, config and narrow base the line
// names for the check ledger (RC-04, ADR 0035). start-checks.ts runs one; a run on the base branch merged in early
// whose red took the merge back runs again on the head as submitted (RC-05, early-merge.ts), the red checks first and
// then the rest, those carried by the ledger: each a run of its own, with its own pair of lines.
import { checksOfRun } from '@elvaria/runner-core';
import type { CarriedCheck, EventData, Quest, Result, Territory } from '@elvaria/domain';
import type { CheckRunMode } from '@elvaria/runner-core';

import { carriedFor, checkPointOf, factsOf, ranEndOf } from '../check-ledger/carry.ts';
import { STEWARD } from '../quest/record.ts';
import { checkModeFor, modeMarkOf } from './check-mode.ts';
import { checksOf, headOf } from './checks.ts';
import { inScratch } from './scratch.ts';
import type { RunChecks } from './checks.ts';
import type { Context } from '../context.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** What every run of the checks of run `n` of `quest` is given. */
export interface RunGiven {
  readonly quest: Quest;
  readonly territory: Territory;
  readonly n: number;
  readonly secrets: Readonly<Record<string, string>>;
  readonly signal: AbortSignal;
}

/** How one run differs (RC-05): only some checks of the territory, the ledger's carried, what its end line adds. */
export interface RunHow {
  /** The ids of the territory's checks to run; absent: those the paths select. */
  readonly only?: readonly string[];
  /** The ledger carries what it holds green on this tree (the red ones just run again green). */
  readonly carry?: true;
  /** Decides, once the checks ended and before `check.end`, what the line adds (`taken_back`). */
  readonly ended?: (checks: Result<RunChecks, string>) => Promise<Readonly<Record<string, unknown>>>;
}

/** A run that ended: what the checks gave, the commit they ran on, what its end line added. */
export interface Ran {
  readonly checks: Result<RunChecks, string>;
  readonly head: string | null;
  readonly added: Readonly<Record<string, unknown>>;
}

/**
 * What `check.end` says of checks that ended (P1-10b): killed, unable to run, or what each gave, and which check's
 * environment failed when the run is set aside for it (PS-01b, (b) of P1-54): the bell alone told it before, to the
 * terminal of `elvaria run`, and nothing was left of it once the Steward restarted.
 */
function endOf(
  ran: Result<RunChecks, string>,
  signal: AbortSignal,
  carried: readonly CarriedCheck[],
): EventData<'check.end'> {
  if (signal.aborted) return { outcome: 'stopped', checks: [] };
  if (!ran.ok) return { outcome: 'error', checks: [] };
  // A check the ledger carried names the line of its real run (RC-03), which the judge's checks do not hold.
  const from = new Map<string, CarriedCheck['from']>(carried.map(({ id, from: line }) => [id, line]));
  const checks = ran.value.checks.map((check) => ({ ...check, carried_from: from.get(check.id) }));
  return ranEndOf(checks, ran.value.environment);
}

/** A `check.*` line; one that cannot be written costs the owner a line, never the checks. */
async function noteChecks(
  ctx: Context,
  quest: Quest,
  type: 'check.start' | 'check.end',
  data: Readonly<Record<string, unknown>>,
): Promise<void> {
  try {
    await ctx.record.note({ type, actor: STEWARD, data, quest });
  } catch (error) {
    ctx.deps.log.warn(`steward: ${quest.id}: no ${type} line: ${messageOf(error)}`);
  }
}

/**
 * The territory with the checks the run takes ((CM-08) in `deferred`, a narrow run leaves defer_to_merge ones to the
 * train), of them only those `only` names: the rest neither runs nor is said to.
 */
function withOnly(territory: Territory, mode: CheckRunMode, only: readonly string[] | undefined): Territory {
  const checks = checksOfRun(territory, mode, 'session');
  return {
    ...territory,
    checks: only === undefined ? [...checks] : checks.filter(({ id }) => only.includes(id)),
  };
}

/** One run of the checks in the quest's plot (or its judge's scratch plot), its two lines around it. */
export async function runOnce(ctx: Context, given: RunGiven, how: RunHow = {}): Promise<Ran> {
  const { quest, territory, n, secrets, signal } = given;
  const mode = await checkModeFor(ctx, quest, territory, 'session');
  // The checks start within the tick, the line beside them; the end's line always follows the start's.
  const started = noteChecks(ctx, quest, 'check.start', modeMarkOf(mode));
  // Read before they run: a commit made while they run makes them stale.
  const head = await headOf(ctx, quest);
  // (RC-04, ADR 0035) The tree they run on, a fact for the ledger (plans/recheck.md §2.2). A scratch plot is the
  // judge's, not the quest's: its run names no tree.
  const point = inScratch(ctx, quest) ? undefined : await checkPointOf(ctx, quest, mode);
  const carried: readonly CarriedCheck[] = how.carry === true ? await carriedFor(ctx, territory, point) : [];
  const options = { signal, secrets, mode, carried };
  const checks = await checksOf(ctx, quest, withOnly(territory, mode, how.only), n, options);
  await started;
  const added = (await how.ended?.(checks)) ?? {};
  const facts = checks.ok ? factsOf(territory, point) : {};
  await noteChecks(ctx, quest, 'check.end', {
    ...endOf(checks, signal, carried),
    ...modeMarkOf(mode),
    ...facts,
    ...added,
  });
  return { checks, head, added };
}
