// The machine's work outside the tick (implementation-plan §3.1, §3.12, P1-25): a submitted quest's checks before
// its judge, a script-tier run. A tick starts the work and goes on, so a check of minutes never holds the inbox, the
// sessions' ends or the claims. The work writes only into its run's folder in `.runs/`, never a quest or a character
// file (a tick does, one write at a time); a later tick reads what it left: the checks' results here, a script's
// output in `script.json`. The table lives in memory: a Steward that stops kills the work, the next one runs it again.
import { currentRun } from '@elvaria/domain';
import type { BackgroundWork, Quest, QuestId, VerdictCheck } from '@elvaria/domain';

import type { Logger } from './types.ts';

export type BackgroundKind = 'checks' | 'script';

/** One piece of work: aborted when the Steward stops or the quest moves on, and given up then. */
type Work<T> = (signal: AbortSignal) => Promise<T>;

interface Entry {
  readonly kind: BackgroundKind;
  /** The run (attempt_log n) the work is for. */
  readonly n: number;
  readonly control: AbortController;
  running: boolean;
  /** What checks that ended gave: waits for the judge, or the machine, that takes it. */
  checks?: readonly VerdictCheck[];
}

export interface Background {
  /** Runs the checks of run `n` of `quest`; undefined from the work means they could not run (a later tick tries again). */
  checks(quest: QuestId, n: number, work: Work<readonly VerdictCheck[] | undefined>): void;
  /** Runs the script of run `n` of `quest`; its files say how it ended. */
  script(quest: QuestId, n: number, work: Work<void>): void;
  /** What planTick needs to know (BackgroundWork). */
  view(): BackgroundWork;
  /** The ended checks of run `n`, taken: the next judge of the run gets its own run of the checks (P1-04). */
  take(quest: QuestId, n: number): readonly VerdictCheck[] | undefined;
  /** Aborts and forgets the work `wanted` no longer wants. */
  prune(wanted: (quest: QuestId, kind: BackgroundKind, n: number) => boolean): void;
  /** Resolves once the work running now has ended. */
  idle(): Promise<void>;
  /** Aborts all the work and waits until each piece has ended (the Steward stops). */
  stop(): Promise<void>;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The table and the work still to end; an entry stays after its work ended only while its checks wait. */
interface State {
  readonly log: Logger;
  readonly table: Map<QuestId, Entry>;
  readonly live: Set<Promise<void>>;
}

/** What one piece of work is: its quest, kind and run, and what it does. */
interface Piece<T> {
  readonly quest: QuestId;
  readonly kind: BackgroundKind;
  readonly n: number;
  readonly work: Work<T>;
}

/** Starts `piece` unless work runs on its quest; `keep` says whether what it gave stays in the table. */
function start<T>(state: State, piece: Piece<T>, keep: (value: T, entry: Entry) => boolean): void {
  const { quest, kind, n } = piece;
  if (state.table.has(quest)) return;
  const entry: Entry = { kind, n, control: new AbortController(), running: true };
  state.table.set(quest, entry);
  const done = piece
    .work(entry.control.signal)
    .then(
      (value) => !entry.control.signal.aborted && keep(value, entry),
      (error: unknown) => {
        state.log.warn(`steward: ${quest}: its ${kind} stopped: ${messageOf(error)}`);
        return false;
      },
    )
    .then((kept) => {
      entry.running = false;
      // Pruned work is gone from the table already, and a later piece may hold its place.
      if (!kept && state.table.get(quest) === entry) state.table.delete(quest);
    });
  state.live.add(done);
  void done.finally(() => state.live.delete(done));
}

export function createBackground(log: Logger): Background {
  const state: State = { log, table: new Map(), live: new Set() };
  const { table, live } = state;
  return {
    checks: (quest, n, work) => {
      start(state, { quest, kind: 'checks', n, work }, (checks, entry) => {
        if (checks === undefined) return false;
        entry.checks = checks;
        return true;
      });
    },
    // A script that ended leaves its output on disk: nothing waits here.
    script: (quest, n, work) => {
      start(state, { quest, kind: 'script', n, work }, () => false);
    },
    view: () => {
      const entries = [...table.entries()];
      return {
        running: entries.filter(([, entry]) => entry.running).map(([quest]) => quest),
        checked: entries.filter(([, entry]) => entry.checks !== undefined).map(([quest]) => quest),
      };
    },
    take: (quest, n) => {
      const entry = table.get(quest);
      if (entry?.checks === undefined || entry.n !== n) return undefined;
      table.delete(quest);
      return entry.checks;
    },
    prune: (wanted) => {
      for (const [quest, entry] of table) {
        if (wanted(quest, entry.kind, entry.n)) continue;
        entry.control.abort();
        table.delete(quest);
      }
    },
    idle: async () => {
      await Promise.all(live);
    },
    stop: async () => {
      for (const entry of table.values()) entry.control.abort();
      table.clear();
      await Promise.all(live);
    },
  };
}

/**
 * The work still wanted for the quests as `quests` hold them: checks while the quest waits in review for a judge,
 * a script while the quest works, both on the same run. A quest cancelled, judged or moved on loses its work.
 */
export const wantedIn =
  (quests: ReadonlyMap<QuestId, Quest>) =>
  (id: QuestId, kind: BackgroundKind, n: number): boolean => {
    const quest = quests.get(id);
    if (quest === undefined || currentRun(quest) !== n) return false;
    return kind === 'checks'
      ? quest.status === 'review' && typeof quest.verifier !== 'string'
      : quest.status === 'working';
  };
