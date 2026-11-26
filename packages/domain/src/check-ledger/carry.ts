// The rule of the same tree (RC-03, ADR 0035, plans/recheck.md §2.1): before a check runs, the Steward asks the check
// ledger, and carries the check instead when the ledger holds a green of the very command it would run on the very
// tree it would run on, under the same check commands and commands.setup, at most CARRY_MAX_AGE_HOURS old; for a
// narrow command, from the same diff base too. A green of `run` never stands for one of `narrow`, nor the other way.
// No tree (uncommitted changes, no git) carries nothing. The decision is pure; the Steward only acts on it (RC-04).
import { MS_PER_MINUTE } from '../constants.ts';
import { MINUTES_PER_HOUR } from '../dispatch/constants.ts';
import { CARRY_MAX_AGE_HOURS } from './constants.ts';
import type { CheckLedgerRow } from './ledger.ts';
import type { Instant } from '../core/clock.ts';
import type { CheckId, TerritoryId, Ulid } from '../core/ids.ts';
import type { TerritoryCheck } from '../schema/territory.ts';

const CARRY_MAX_AGE_MS = CARRY_MAX_AGE_HOURS * MINUTES_PER_HOUR * MS_PER_MINUTE;

/** The command a check runs: `narrow` in a narrow run where it has one, else `run` (runner-core's checkLinesOf). */
export type CheckCommand = 'run' | 'narrow';

/** A check about to run, as the territory has it now. */
export type PlannedCheck = Pick<TerritoryCheck, 'id' | 'narrow'>;

export const checkCommandOf = (check: PlannedCheck, narrow: boolean): CheckCommand =>
  narrow && check.narrow !== undefined ? 'narrow' : 'run';

export interface CarryRequest {
  readonly territory: TerritoryId;
  /** The tree about to be checked; undefined with uncommitted changes or no git, and nothing is carried. */
  readonly tree: string | undefined;
  /** The fingerprint of the territory's check commands now (`config`). */
  readonly config: string;
  /** The checks about to run, as the territory has them now, in order. */
  readonly checks: readonly PlannedCheck[];
  /** A narrow run's: the commit its diff counts from (ELVARIA_CHECK_BASE). Absent: a run in full. */
  readonly base?: string;
  readonly now: Instant;
}

export interface CarriedCheck {
  readonly id: CheckId;
  /** The line of the green run it stands for: its `carried_from`. */
  readonly from: Ulid;
}

export interface Carry {
  /** The checks that run, in the request's order. */
  readonly run: readonly CheckId[];
  readonly carried: readonly CarriedCheck[];
}

/** The row is of the same territory's same tree, under the same commands, young enough. */
const sameTree = (row: CheckLedgerRow, request: CarryRequest): boolean =>
  row.territory === request.territory &&
  row.tree === request.tree &&
  row.config === request.config &&
  request.now - Date.parse(row.at) <= CARRY_MAX_AGE_MS;

/**
 * The row ran the very command `check` would run now. The same config says the check's commands were the same then,
 * so whether a narrow row ran its narrow command is the same question as now.
 */
function sameCommand(row: CheckLedgerRow, check: PlannedCheck, request: CarryRequest): boolean {
  const command = checkCommandOf(check, request.base !== undefined);
  if (row.check !== check.id || checkCommandOf(check, row.base !== undefined) !== command) return false;
  return command === 'run' || row.base === request.base;
}

/** Which of the request's checks run and which are carried, each from the newest green that stands for it. */
export function carryOf(ledger: readonly CheckLedgerRow[], request: CarryRequest): Carry {
  const run: CheckId[] = [];
  const carried: CarriedCheck[] = [];
  for (const check of request.checks) {
    const row = ledger.findLast((entry) => sameTree(entry, request) && sameCommand(entry, check, request));
    if (row === undefined) run.push(check.id);
    else carried.push({ id: check.id, from: row.source });
  }
  return { run, carried };
}
