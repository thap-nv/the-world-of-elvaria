// quest.attempt_log as the state machine keeps it (implementation-plan §2.3, §2.5). A run number `n` counts every
// attempt the quest ever started and never goes back, unlike `attempts`, which `retry` resets to 0: verdict ids
// (`<quest>-<n>`) and run folders (`.runs/<quest>-<n>`) must stay unique for the life of the quest.
import type { CharacterId } from '../core/ids.ts';
import type { Role } from '../schema/common.ts';
import type { Attempt } from '../schema/quest/quest-parts.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { RunEnd } from './events.ts';

type Outcome = NonNullable<Attempt['outcome']>;

/** The run number of the latest attempt, 0 before the first one. */
export const currentRun = (quest: Quest): number =>
  quest.attempt_log.reduce(
    (latest, entry) => (entry.role === 'assignee' ? Math.max(latest, entry.n) : latest),
    0,
  );

/** `.runs/<quest>-<n>`, and `/verify` below it for the verifier (attempt_log[].run_dir). */
export const runDirOf = (quest: Quest, n: number, role: Role): string =>
  role === 'verifier' ? `.runs/${quest.id}-${n}/verify` : `.runs/${quest.id}-${n}`;

export interface OpenRun {
  readonly n: number;
  readonly role: Role;
  readonly character: CharacterId | null;
  readonly at: string;
  readonly session_id?: string | undefined;
}

/** A new entry for a session that starts now; it is open until a run-ending event closes it. */
export function entryOf(quest: Quest, run: OpenRun): Attempt {
  return {
    n: run.n,
    character: run.character,
    role: run.role,
    started_at: run.at,
    ...(run.session_id === undefined ? {} : { session_id: run.session_id }),
    run_dir: runDirOf(quest, run.n, run.role),
  };
}

const isOpen = (entry: Attempt, role: Role): boolean => entry.role === role && entry.ended_at === undefined;

/**
 * Ends the open session of `role`, if any: a verdict from the machine, for one, ends no session. What the runner
 * reports wins over what the entry already holds.
 */
export function closeRun(
  log: readonly Attempt[],
  role: Role,
  ending: { readonly at: string; readonly outcome: Outcome; readonly run: RunEnd },
): Attempt[] {
  const index = log.findLastIndex((entry) => isOpen(entry, role));
  return log.map((entry, at) =>
    at === index
      ? {
          ...entry,
          ended_at: ending.at,
          outcome: ending.outcome,
          ...(ending.run.session_id === undefined ? {} : { session_id: ending.run.session_id }),
          ...(ending.run.tokens === undefined ? {} : { tokens: ending.run.tokens }),
        }
      : entry,
  );
}
