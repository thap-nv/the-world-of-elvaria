// The check ledger (RC-03, ADR 0035, plans/recheck.md §2.1): a green run of a check is a fact about a git tree, not a
// commit or a branch, so it is keyed by the tree it ran on, the fingerprint of the commands it ran and, for a narrow
// run, the commit its diff counted from. A pure function of the log, as forgeOutcomesOf is: no file of its own, the
// Steward builds it at start and adds each line it writes (ledgerRowsOf). It belongs to no quest and no pull request,
// so the merge queue, a guest's try, the patrol and the train read the same one. What is no fact stays out: a red
// check (one that failed for its environment too), a line on uncommitted changes (no `tree`), and a carried check,
// which ran nowhere: its age counts from the run it stands for.
import { isEventOf } from '../schema/event/event.ts';
import type { TerritoryId, Ulid } from '../core/ids.ts';
import type { Event } from '../schema/event/event.ts';

/** One green run of one check on one tree. */
export interface CheckLedgerRow {
  readonly territory: TerritoryId;
  /** A check id of the territory. */
  readonly check: string;
  readonly tree: string;
  /** The fingerprint of the territory's check commands then (`config`). */
  readonly config: string;
  /**
   * A narrow run's (`check.end` with mode narrow): the commit its diff counted from; the check ran its narrow command
   * if it has one. Absent: every check ran its `run` (a patrol, a run in full).
   */
  readonly base?: string;
  /** When it ran: the line's `ts`. */
  readonly at: string;
  /** The line: what a check carried from it names in `carried_from`. */
  readonly source: Ulid;
}

interface LedgerLine {
  readonly territory: TerritoryId | undefined;
  readonly tree: string | undefined;
  readonly config: string | undefined;
  readonly base: string | undefined;
  readonly narrow: boolean;
  readonly checks: readonly { id: string; pass: boolean; carried_from?: string | undefined }[];
}

/** What `event` says of the ledger, or nothing: a line of another type. */
function lineOf(event: Event): LedgerLine | undefined {
  if (isEventOf(event, 'check.end')) {
    const { tree, config, base, mode, checks } = event.data;
    return { territory: event.territory, tree, config, base, narrow: mode === 'narrow', checks };
  }
  if (isEventOf(event, 'patrol.ran')) {
    const { territory, tree, config, checks } = event.data;
    return { territory, tree, config, base: undefined, narrow: false, checks };
  }
  return undefined;
}

/**
 * The rows one line adds to the ledger: its green checks that ran, when it names its territory, tree and config. A
 * narrow line without its base adds none, as it cannot be told from a run in full.
 */
export function ledgerRowsOf(event: Event): CheckLedgerRow[] {
  const line = lineOf(event);
  if (line === undefined) return [];
  const { territory, tree, config, base } = line;
  if (territory === undefined || tree === undefined || config === undefined) return [];
  if (line.narrow && base === undefined) return [];
  const narrow = base === undefined ? {} : { base };
  return line.checks
    .filter(({ pass, carried_from: from }) => pass && from === undefined)
    .map(({ id }) => ({
      territory,
      check: id,
      tree,
      config,
      ...narrow,
      at: event.ts,
      source: event.id,
    }));
}

/** The ledger of a log, in its order (checkLedgerOf(events) = events.flatMap(ledgerRowsOf)). */
export const checkLedgerOf = (events: readonly Event[]): CheckLedgerRow[] => events.flatMap(ledgerRowsOf);
