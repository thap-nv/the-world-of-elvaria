// The sessions this Steward opened and has not recorded the end of yet (implementation-plan §3.1). A session's
// end arrives whenever its CLI exits; it waits here until the next tick records it, so every write of the kingdom
// still happens inside a tick, one at a time.
import type { CharacterId, QuestId, Role } from '@elvaria/domain';
import type { RunResult, RunningSession } from '@elvaria/runner-core';

export interface Running {
  readonly quest: QuestId;
  readonly role: Role;
  /** The run (attempt_log n) the session belongs to. */
  readonly n: number;
  readonly character: CharacterId;
  readonly session: RunningSession;
  readonly session_id: string;
  /** The values of the secrets the session was given (§3.9): what its end masks in the letter and the verdict. */
  readonly known: readonly string[];
}

export interface Finished {
  readonly running: Running;
  readonly result: RunResult;
}

export interface Sessions {
  add(running: Running): void;
  get(quest: QuestId): Running | undefined;
  /** Sessions that ended since the last call, in the order they ended; they leave the table. */
  drain(): Finished[];
  /** Ends the quest's session on purpose (cancel): its end is not recorded. */
  kill(quest: QuestId, reason: string): Promise<void>;
  /** Stops recording ends and kills every session (the Steward stops). */
  close(reason: string): Promise<void>;
  size(): number;
}

/** Reads a session's signals so a runner never buffers them without end; the breakers (P1-06) will use them. */
async function consume(session: RunningSession): Promise<void> {
  for await (const _signal of session.signals) {
    // Read and dropped until the breakers (P1-06) and the mana gauge (P1-05) watch them.
  }
}

export function createSessions(): Sessions {
  const table = new Map<QuestId, Running>();
  const ended: Finished[] = [];
  const dropped = new Set<RunningSession>();
  let open = true;

  return {
    add: (running) => {
      table.set(running.quest, running);
      void consume(running.session).catch(() => undefined);
      void running.session.wait().then(
        (result) => {
          if (open && !dropped.has(running.session)) ended.push({ running, result });
        },
        () => undefined,
      );
    },
    get: (quest) => table.get(quest),
    drain: () => {
      const done = ended.splice(0);
      for (const { running } of done) if (table.get(running.quest) === running) table.delete(running.quest);
      return done;
    },
    kill: async (quest, reason) => {
      const running = table.get(quest);
      if (running === undefined) return;
      dropped.add(running.session);
      table.delete(quest);
      await running.session.kill(reason);
    },
    close: async (reason) => {
      open = false;
      const all = [...table.values()];
      table.clear();
      await Promise.all(all.map(({ session }) => session.kill(reason)));
    },
    size: () => table.size,
  };
}
