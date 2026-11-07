// The pids of the sessions a Steward holds, in `.state/sessions.json` (implementation-plan §3.1 "(P1-03)", P1-06).
// A Steward that crashes leaves its CLIs running in the plots, still spending mana and still writing; the next
// start kills those trees before the first tick calls their runs lost and opens fresh sessions on the same plots.
// A pid alone could name an unrelated program after a reboot or a long wait, so a tree is killed only when the
// process under that pid started when the session was spawned.
import { isAlive, killTree, processStartOf } from '@elvaria/runner-core';
import { inKingdom, readTextFile, writeFileAtomic } from '@elvaria/store';

import type { Running } from './running.ts';
import type { StewardDeps } from '../types.ts';

/** Kingdom-relative path of the record (§2.2 `.state/`). */
export const SESSIONS_FILE = '.state/sessions.json';
const FILE_VERSION = 1;
const JSON_INDENT = 2;
/**
 * How far apart the spawn the record says and the start the system says may be for one process: the record is
 * stamped right after the runner spawned the CLI; ps reads the start to the second.
 */
export const SAME_PROCESS_MS = 60_000;

export interface SessionPid {
  readonly quest: string;
  readonly role: string;
  readonly character: string;
  readonly pid: number;
  readonly spawned_at: string;
}

/** The record of the sessions held now; an in-process session (FakeRunner, pid 0) has no process to keep. */
export function pidsWriter(root: string): (held: readonly Running[]) => Promise<void> {
  return async (held) => {
    const sessions: SessionPid[] = held
      .filter(({ session }) => session.pid > 0)
      .map(({ quest, role, character, session, spawned_at }) => ({
        quest,
        role,
        character,
        pid: session.pid,
        spawned_at,
      }));
    await writeFileAtomic(
      inKingdom(root, SESSIONS_FILE),
      `${JSON.stringify({ version: FILE_VERSION, sessions }, null, JSON_INDENT)}\n`,
    );
  };
}

const isSessionPid = (value: unknown): value is SessionPid => {
  const entry = value as Partial<SessionPid> | null;
  return (
    typeof entry?.quest === 'string' &&
    typeof entry.character === 'string' &&
    Number.isInteger(entry.pid) &&
    typeof entry.spawned_at === 'string'
  );
};

/** What the last Steward wrote; nothing when the file is missing, torn or of another version. */
export async function readPids(root: string): Promise<SessionPid[]> {
  const text = await readTextFile(inKingdom(root, SESSIONS_FILE));
  if (text === undefined) return [];
  try {
    const file = JSON.parse(text) as { version?: unknown; sessions?: unknown };
    if (file.version !== FILE_VERSION || !Array.isArray(file.sessions)) return [];
    return file.sessions.filter(isSessionPid);
  } catch {
    return [];
  }
}

/**
 * A recorded session whose pid is still alive: `same` when that process started at the spawn (the session itself),
 * `other` when it started at another time (the pid was reused), `unknown` when the system would not tell.
 */
export interface LeftSession extends SessionPid {
  readonly process: 'same' | 'other' | 'unknown';
}

/**
 * The recorded sessions whose pid is still alive; a pid that has ended is left out. Read by the next Steward, and
 * by `elvaria doctor` (P1-11), which reports them while no Steward holds the lock.
 */
export async function leftSessions(root: string): Promise<LeftSession[]> {
  const left: LeftSession[] = [];
  for (const entry of await readPids(root)) {
    if (!isAlive(entry.pid)) continue;
    left.push({ ...entry, process: whoseProcess(await processStartOf(entry.pid), entry.spawned_at) });
  }
  return left;
}

function whoseProcess(started: number | undefined, spawnedAt: string): LeftSession['process'] {
  if (started === undefined) return 'unknown';
  return Math.abs(started - Date.parse(spawnedAt)) <= SAME_PROCESS_MS ? 'same' : 'other';
}

/**
 * At start, before the first tick: kills the tree of every session the last Steward left running, then clears the
 * record. A pid whose process started at another time belongs to someone else now, and is left alone; so is one
 * whose start the system would not tell (the owner reads the warning and the pid).
 */
export async function reapOrphans(deps: Pick<StewardDeps, 'store' | 'log'>): Promise<void> {
  const root = deps.store.root;
  for (const left of await leftSessions(root)) {
    const who = `${left.quest}: ${left.character}'s session (pid ${String(left.pid)})`;
    if (left.process === 'unknown') {
      deps.log.warn(`steward: ${who}: still running, but when it started is unknown; left alone`);
      continue;
    }
    if (left.process === 'other') {
      deps.log.warn(`steward: ${who}: the pid now belongs to another process; left alone`);
      continue;
    }
    await killTree(left.pid);
    deps.log.warn(`steward: ${who} outlived the last Steward; its process tree was killed`);
  }
  await pidsWriter(root)([]);
}
