// What a territory trial of the merge queue says (CM-07, CM-08, ADR 0032): a guest entry's try (guest.ts) and a
// delivery train (train.ts) run commands.setup and the checks in a plot of their own. Its `check.end` says what each
// check gave, or that they could not run or were stopped; it is red when commands.setup or a check is, unless a check
// was set aside for its environment (environmentFailureOf), which counts as green, as in the queue's update (update.ts).
// Its `check.*` lines name the territory, no quest; one that cannot be written costs the owner a line, never the run.
import { environmentFailureOf } from '@elvaria/domain';
import type { EventData, TerritoryId, TerritoryTrial } from '@elvaria/domain';

import { endChecksOf } from '../check-ledger/carry.ts';
import { STEWARD } from '../quest/record.ts';
import { messageOf } from './delivery.ts';
import type { Context } from '../context.ts';

/** The red checks of a trial, as `delivery.guest_refused` and `train.ran` name them: id, timed out, last line. */
export type TrialRed = NonNullable<EventData<'train.ran'>['checks']>;
type Aside = NonNullable<ReturnType<typeof environmentFailureOf>>;

/** A `check.*` line of a trial, its `data` marked `delivery` and `guest` or `train`. */
export interface CheckLine {
  readonly type: 'check.start' | 'check.end';
  readonly data: Record<string, unknown>;
}

/** The line `line` of the trial `who` names, on `territory`. */
export async function noteCheckLine(ctx: Context, territory: TerritoryId, who: string, line: CheckLine) {
  try {
    await ctx.record.note({ ...line, actor: STEWARD, territory });
  } catch (error) {
    ctx.deps.log.warn(`steward: ${who}: no ${line.type} line: ${messageOf(error)}`);
  }
}

/** What `check.end` says of the trial: what each check gave, or that they could not run or were stopped. */
export function trialEndOf(trial: TerritoryTrial | undefined, signal: AbortSignal) {
  if (signal.aborted) return { outcome: 'stopped', checks: [] };
  if (trial === undefined || trial.plot_failure !== undefined) return { outcome: 'error', checks: [] };
  const { setup, checks } = trial;
  const environment = environmentFailureOf(checks);
  return {
    outcome: setup?.pass !== false && checks.every(({ pass }) => pass) ? 'pass' : 'fail',
    checks: endChecksOf(checks),
    ...(environment === undefined
      ? {}
      : { environment: { check: environment.check, line: environment.line } }),
  };
}

const lineOf = ({ timed_out, error_line }: { timed_out: boolean; error_line?: string | undefined }) => ({
  ...(timed_out ? { timed_out: true as const } : {}),
  ...(error_line === undefined || error_line === '' ? {} : { line: error_line }),
});

/** Why the trial is red: commands.setup, or the red checks; undefined when green or set aside (told to `aside`). */
export function trialRedOf(trial: TerritoryTrial, aside: (environment: Aside) => void): TrialRed | undefined {
  if (trial.setup !== null && !trial.setup.pass) return [{ id: 'setup', ...lineOf(trial.setup) }];
  const red = trial.checks.filter(({ pass }) => !pass);
  if (red.length === 0) return undefined;
  const environment = environmentFailureOf(trial.checks);
  if (environment === undefined) return red.map((check) => ({ id: check.id, ...lineOf(check) }));
  aside(environment);
  return undefined;
}
