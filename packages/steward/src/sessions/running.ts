// The sessions this Steward opened and has not recorded the end of yet (implementation-plan §3.1). A session's
// end arrives whenever its CLI exits; it waits here until the next tick records it, so every write of the kingdom
// still happens inside a tick, one at a time. The table also keeps what the breakers read (the usage each session
// reported, §3.4) and hands every change to `save`, which keeps the pids in `.state/` for a restart (P1-06).
import type { CharacterId, HeldSession, QuestId, Role, UsageSoFar, VerdictCheck } from '@elvaria/domain';
import type { RunResult, RunningSession } from '@elvaria/runner-core';

export interface Running {
  readonly quest: QuestId;
  readonly role: Role;
  /** The run (attempt_log n) the session belongs to. */
  readonly n: number;
  readonly character: CharacterId;
  /** The model the session runs, as the character had it at spawn: a usage limit is charged to it (P1-22). */
  readonly model?: string;
  readonly session: RunningSession;
  readonly session_id: string;
  /** A verifier's: the machine checks that ran before its session, for the verdict file (§3.2); none for an assignee. */
  readonly checks: readonly VerdictCheck[];
  /** When the runner had spawned the CLI (ISO 8601): tells its process from a later one under the same pid. */
  readonly spawned_at: string;
}

export interface Finished {
  readonly running: Running;
  readonly result: RunResult;
}

export interface Sessions {
  add(running: Running): void;
  get(quest: QuestId): Running | undefined;
  /** Every session held, with what its stream reported so far: planTick's breakers read it (§3.4). */
  held(): HeldSession[];
  /** Sessions that ended since the last call, in the order they ended; they leave the table. */
  drain(): Finished[];
  /**
   * Ends a session on purpose (a breaker, a pool out of mana, the owner's cancel): it leaves the table, its tree is
   * killed, and its end comes back here instead of through drain.
   */
  stop(running: Running, reason: string): Promise<RunResult>;
  /** stop() for the session on `quest`, if any, when its end is of no use. */
  kill(quest: QuestId, reason: string): Promise<void>;
  /**
   * The session on `quest` went on in a process of its own (a reply tried again, a reminder of the letter, P1-33):
   * the record names that process, spawned at `spawnedAt`, so a restart reaps it and not the first one.
   */
  respawned(quest: QuestId, spawnedAt: string): void;
  /** Stops recording ends and kills every session (the Steward stops). */
  close(reason: string): Promise<void>;
  size(): number;
  /** Resolves once `save` has seen the table as it is now. */
  saved(): Promise<void>;
}

/** Reads a session's signals so a runner never buffers them without end; usage goes to the breakers. */
async function consume(session: RunningSession, usage: { tokens: number }): Promise<void> {
  for await (const signal of session.signals) {
    // A running total that never goes down (§3.7); the highest seen is the session's spend so far.
    if (signal.kind === 'usage') usage.tokens = Math.max(usage.tokens, signal.tokens);
  }
}

export type SaveSessions = (held: readonly Running[]) => Promise<void>;

type Spent = WeakMap<Running, { tokens: number }>;

const heldOf = (table: ReadonlyMap<QuestId, Running>, spent: Spent): HeldSession[] =>
  [...table.values()].map((running) => ({
    quest: running.quest,
    role: running.role,
    usage: { tokens: spent.get(running)?.tokens ?? 0 } satisfies UsageSoFar,
  }));

/**
 * The record `save` keeps of the table: one write at a time, each of the table as it was when it changed, every
 * session at its latest spawn (`respawn`: the process a session runs in now, once it is not the first, P1-33).
 */
function recordOf(save: SaveSessions, table: ReadonlyMap<QuestId, Running>) {
  const respawns = new WeakMap<RunningSession, string>();
  let saving = Promise.resolve();
  const persist = (): void => {
    const now = [...table.values()].map((running) => ({
      ...running,
      spawned_at: respawns.get(running.session) ?? running.spawned_at,
    }));
    saving = saving.then(() => save(now)).catch(() => undefined);
  };
  const respawn = (session: RunningSession, spawnedAt: string): void => {
    respawns.set(session, spawnedAt);
    persist();
  };
  return { persist, respawn, saved: () => saving };
}

export function createSessions(save: SaveSessions = () => Promise.resolve()): Sessions {
  const table = new Map<QuestId, Running>();
  const usage: Spent = new WeakMap();
  const ended: Finished[] = [];
  const dropped = new Set<RunningSession>();
  const { persist, respawn, saved } = recordOf(save, table);
  let open = true;
  const stop = async (running: Running, reason: string): Promise<RunResult> => {
    dropped.add(running.session);
    if (table.get(running.quest) === running) table.delete(running.quest);
    persist();
    await running.session.kill(reason);
    return running.session.wait();
  };

  return {
    add: (running) => {
      table.set(running.quest, running);
      const spent = { tokens: 0 };
      usage.set(running, spent);
      persist();
      void consume(running.session, spent).catch(() => undefined);
      void running.session.wait().then(
        (result) => {
          if (open && !dropped.has(running.session)) ended.push({ running, result });
        },
        () => undefined,
      );
    },
    get: (quest) => table.get(quest),
    held: () => heldOf(table, usage),
    drain: () => {
      const done = ended.splice(0).filter(({ running }) => !dropped.has(running.session));
      for (const { running } of done) if (table.get(running.quest) === running) table.delete(running.quest);
      if (done.length > 0) persist();
      return done;
    },
    stop,
    kill: async (quest, reason) => {
      const running = table.get(quest);
      if (running !== undefined) await stop(running, reason);
    },
    respawned: (quest, spawnedAt) => {
      const running = table.get(quest);
      if (running !== undefined) respawn(running.session, spawnedAt);
    },
    close: async (reason) => {
      open = false;
      const all = [...table.values()];
      table.clear();
      persist();
      await Promise.all(all.map(({ session }) => session.kill(reason)));
    },
    size: () => table.size,
    saved,
  };
}
