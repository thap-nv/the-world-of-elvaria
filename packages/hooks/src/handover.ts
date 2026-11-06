// The Stop gate of ADR 0010: an assignee may not finish while `handover.md` is unchanged since the attempt
// started. It asks at most STOP_BLOCK_LIMIT times per session, then lets the session end and leaves an
// `agent.notification` in the journal for the verifier (implementation-plan §2.4, §3.6).
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { errorText, notification, translation } from './draft.ts';
import { readState, stateFile, writeState } from './run-state.ts';
import type { HookContext } from './context.ts';
import type { Translation } from './draft.ts';

export const STOP_BLOCK_LIMIT = 2;
const START_FILE = 'handover-start.json';
const BLOCKS_FILE = 'stop-blocks.json';

/** `quests/<id>/handover.md` of the kingdom (§2.2). */
export const handoverPath = (kingdom: string, quest: string): string =>
  path.join(kingdom, 'quests', quest, 'handover.md');

const FNV_OFFSET = 0x81_1c_9d_c5;
const FNV_PRIME = 0x01_00_01_93;

/**
 * Size and FNV-1a hash of a file, or null when it does not exist. Enough to tell an edited letter from an
 * untouched one, and node:crypto is not on the hook's list (§1.4). Rewriting the same text counts as unchanged.
 */
export function fingerprintOf(file: string): string | null {
  let bytes: Buffer;
  try {
    bytes = readFileSync(file);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
  let hash = FNV_OFFSET;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, FNV_PRIME) >>> 0;
  return `${bytes.length}:${hash.toString(16).padStart(8, '0')}`;
}

interface Gate {
  readonly letter: string;
  readonly runDir: string;
}

/** Only an assignee working a quest writes a letter, and the gate needs the run folder to count. */
function gateOf(ctx: HookContext): Gate | undefined {
  const { role, kingdom, quest, runDir } = ctx;
  if (role !== 'assignee' || kingdom === undefined || quest === undefined || runDir === undefined) {
    return undefined;
  }
  return { letter: handoverPath(kingdom, quest), runDir };
}

/** SessionStart: remembers the letter as the attempt found it. Later sessions of the attempt keep the first. */
export function recordHandoverStart(ctx: HookContext): readonly string[] {
  const gate = gateOf(ctx);
  if (gate === undefined) return [];
  try {
    writeState(stateFile(gate.runDir, START_FILE), { fingerprint: fingerprintOf(gate.letter) }, true);
    return [];
  } catch (error) {
    return [`could not record the handover letter at start: ${errorText(error)}`];
  }
}

const blockReason = (letter: string): string =>
  `Elvaria: update the handover letter before finishing. ${letter} is unchanged since this attempt started. ` +
  'Fill its template (Where I am / Done / Not done / Decisions taken / Next step), then finish.';

/**
 * Unchanged means: no letter at all, or the same bytes as at the start. Without a recorded start (the
 * SessionStart hook did not run) an existing letter cannot be judged, so it passes.
 */
function letterUnchanged(gate: Gate): boolean {
  const current = fingerprintOf(gate.letter);
  if (current === null) return true;
  return readState(stateFile(gate.runDir, START_FILE))?.fingerprint === current;
}

/** Blocks so far, per session id; a damaged file counts as none. */
function blocksOf(file: string): Record<string, number> {
  const sessions = readState(file)?.sessions;
  if (typeof sessions !== 'object' || sessions === null) return {};
  return Object.fromEntries(
    Object.entries(sessions).filter((entry): entry is [string, number] => Number.isInteger(entry[1])),
  );
}

/** Stop: blocks while the letter is unchanged, up to STOP_BLOCK_LIMIT times in this session. */
export function stopGate(ctx: HookContext, session: string): Translation {
  const gate = gateOf(ctx);
  if (gate === undefined) return translation([]);
  try {
    if (!letterUnchanged(gate)) return translation([]);
    const file = stateFile(gate.runDir, BLOCKS_FILE);
    const sessions = blocksOf(file);
    const count = sessions[session] ?? 0;
    if (count >= STOP_BLOCK_LIMIT) {
      const message = `Finished with handover.md unchanged since the attempt started, after ${STOP_BLOCK_LIMIT} reminders.`;
      return translation([notification('handover_unchanged', message)]);
    }
    writeState(file, { sessions: { ...sessions, [session]: count + 1 } });
    const message = `Stop blocked (${count + 1}/${STOP_BLOCK_LIMIT}): handover.md unchanged since the attempt started.`;
    return translation([notification('handover_required', message)], { block: blockReason(gate.letter) });
  } catch (error) {
    // The gate is a reminder, not a fence: when it cannot tell, the session may end.
    return translation([], { problems: [`handover check failed: ${errorText(error)}`] });
  }
}
