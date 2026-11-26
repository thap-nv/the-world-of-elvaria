// Step 4 of the probe in the merge queue (CM-06, ADR 0032, plans/check-modes.md "Ở hàng đợi"): checks red after the
// queue merged a green base branch into a done quest's branch are tried on the quest's own head, as its judge passed
// it. Red there: its own change (`own_change`), a late machine verdict (ADR 0033). Green: only the merge of both
// sides is red (`combination`), the queue's merge quest as before (PS-09b). A check that ran green after the session
// with the very command the queue ran it with is a `combination` already, and is not run again.
import { isEventOf } from '../schema/event/event.ts';
import { attributionOf } from './attribution.ts';
import type { QuestId, TerritoryId } from '../core/ids.ts';
import type { CheckAttributedData } from '../schema/event/check-data.ts';
import type { Event } from '../schema/event/event.ts';
import type { VerdictCheck } from '../schema/quest/verdict.ts';
import type { TerritoryCheck } from '../schema/territory.ts';
import type { ProbeRun } from './probe.ts';

/** The `mode` of a run's `check.*` lines: `narrow`, or nothing for a run in full. */
type RunMode = 'narrow' | undefined;

/** The mode of the latest run of `quest`'s checks after a session: its latest `check.end` that is not the queue's. */
export function sessionModeOf(events: readonly Event[], quest: QuestId): RunMode {
  const end = events.findLast(
    (event) => isEventOf(event, 'check.end') && event.quest === quest && event.data.delivery !== true,
  );
  return end !== undefined && isEventOf(end, 'check.end') ? end.data.mode : undefined;
}

type Commands = Pick<TerritoryCheck, 'run' | 'narrow'> & { readonly id: string };

/** The command a run of `mode` gives the check: its `narrow` lines in a narrow run, when it has them (CM-01). */
const commandOf = (check: Commands, mode: RunMode): string =>
  JSON.stringify(mode === 'narrow' && check.narrow !== undefined ? check.narrow : check.run);

export interface OwnRunInput {
  /** The checks red on the queue's merged branch. */
  readonly red: readonly string[];
  /** The checks of the run's verdict: what ran after the session. */
  readonly session: readonly (Pick<VerdictCheck, 'pass'> & { readonly id: string })[];
  readonly session_mode: RunMode;
  readonly queue_mode: RunMode;
  readonly checks: readonly Commands[];
}

/** Of the red checks, those step 4 runs on the quest's own head: none ran green after its session, same command. */
export function ownRunChecksOf(input: OwnRunInput): string[] {
  const green = new Set<string>(input.session.filter(({ pass }) => pass).map(({ id }) => id));
  const proven = (id: string): boolean => {
    const check = input.checks.find((each) => each.id === id);
    return (
      green.has(id) &&
      check !== undefined &&
      commandOf(check, input.session_mode) === commandOf(check, input.queue_mode)
    );
  };
  return input.red.filter((id) => !proven(id));
}

export interface QueueProbe {
  readonly territory: TerritoryId;
  readonly quest: QuestId;
  /** The checks red on the queue's merged branch. */
  readonly checks: readonly string[];
  /** Step 4 on the quest's own head; absent when every red check was proven green after the session. */
  readonly run?: ProbeRun;
}

/** The queue's `check.attributed`: red on its own head ⇒ own_change, green ⇒ combination, a run that cannot say ⇒ unknown. */
export function queueAttributionOf({ territory, quest, checks, run }: QueueProbe): CheckAttributedData {
  // No run: every red check was proven green after the session.
  const red = run === undefined ? false : run.red;
  const cause = red === undefined ? 'unknown' : red ? 'own_change' : 'combination';
  const culprit = cause === 'unknown' ? {} : { culprit: quest };
  const runs = run === undefined ? [] : [run];
  return attributionOf({
    territory,
    source: 'queue',
    checks,
    runs,
    done: { kind: 'done', cause, ...culprit },
  });
}

/**
 * (RC-04, K5, ADR 0035) The queue's red checks run once more on the same tree, in the same run, before it asks the base
 * branch or the quest's own head: green then, they are `flaky` and the delivery goes on, no merge quest opened. `run`
 * is that second run on the queue's merged head; undefined when it is red again or cannot say, and the queue goes on as
 * before.
 */
export function queueFlakyOf(probe: Required<Omit<QueueProbe, 'quest'>>): CheckAttributedData | undefined {
  const { territory, checks, run } = probe;
  if (run.red !== false) return undefined;
  const done = { kind: 'done', cause: 'flaky', commit: run.commit } as const;
  return attributionOf({ territory, source: 'queue', checks, runs: [run], done });
}
