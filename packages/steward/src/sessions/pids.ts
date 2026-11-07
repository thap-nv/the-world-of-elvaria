// The pids of the sessions a Steward holds, in `.state/sessions.json` (implementation-plan §3.1 "(P1-03)", P1-06).
// A Steward that crashes leaves its CLIs running in the plots, still spending mana and still writing; the next
// start kills those trees before the first tick calls their runs lost and opens fresh sessions on the same plots.
// A pid alone could name an unrelated program after a reboot or a long wait, so a tree is killed only when the
// process under that pid started when the session was spawned.
import { killTree, processStartOf } from '@elvaria/runner-core';
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
 * At start, before the first tick: kills the tree of every session the last Steward left running, then clears the
 * record. A pid whose process started at another time belongs to someone else now, and is left alone.
 */
export async function reapOrphans(deps: Pick<StewardDeps, 'store' | 'log'>): Promise<void> {
  const root = deps.store.root;
  for (const left of await readPids(root)) {
    const started = await processStartOf(left.pid);
    if (started === undefined) continue;
    const who = `${left.quest}: ${left.character}'s session (pid ${String(left.pid)})`;
    if (Math.abs(started - Date.parse(left.spawned_at)) > SAME_PROCESS_MS) {
      deps.log.warn(`steward: ${who}: the pid now belongs to another process; left alone`);
      continue;
    }
    await killTree(left.pid);
    deps.log.warn(`steward: ${who} outlived the last Steward; its process tree was killed`);
  }
  await pidsWriter(root)([]);
}
