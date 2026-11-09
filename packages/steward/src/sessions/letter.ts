// The handover letter of a tribe without a tool gate (implementation-plan §3.14 `handover_check: after_session`,
// ADR 0010, P1-33). Its CLI has no Stop hook to hold an assignee's session open while the letter is unchanged, so
// the Steward does what the hook would, after the session: it notes the letter as the attempt's first session found
// it, and when a session ends with the letter unchanged it opens a reminder session (resumed when the tribe can,
// else fresh and told only to write the letter), at most LETTER_REMINDERS_MAX times as the hook blocks at most
// twice; still unchanged, the session ends and the journal says so to the judge (`agent.notification`
// `handover_unchanged`), as the hook's let-through does.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { runDirOf } from '@elvaria/domain';
import { letterReminderPrompt } from '@elvaria/runner-core';
import { inKingdom } from '@elvaria/store';
import type { Quest, TribeId } from '@elvaria/domain';
import type { Follow, Heard, Sequel, SpawnRequest } from '@elvaria/runner-core';

import { handoverPath } from '../files.ts';
import { STEWARD } from '../record.ts';
import type { Context } from '../context.ts';

/** As many reminders as the Stop hook gives a session (STOP_BLOCK_LIMIT of packages/hooks, ADR 0010). */
export const LETTER_REMINDERS_MAX = 2;
/** The letter as the attempt's first session found it; a name of its own beside the hook's `handover-start.json`. */
const LETTER_START = 'letter-start.json';
/** `<run_dir>/letter-<k>`: the k-th reminder's own run folder. */
const REMINDER_DIR = 'letter-';

const errorCode = (error: unknown): unknown =>
  error instanceof Error && 'code' in error ? error.code : undefined;

/** The letter's hash, or null when there is none. */
async function fingerprintOf(letter: string): Promise<string | null> {
  try {
    return createHash('sha256')
      .update(await readFile(letter))
      .digest('hex');
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null;
    throw error;
  }
}

/** Notes the letter as the attempt finds it, once per attempt: later sessions of the attempt keep the first. */
export async function rememberLetter(runDir: string, letter: string): Promise<void> {
  const start = { fingerprint: await fingerprintOf(letter) };
  try {
    await writeFile(path.join(runDir, LETTER_START), `${JSON.stringify(start)}\n`, { flag: 'wx' });
  } catch (error) {
    if (errorCode(error) !== 'EEXIST') throw error;
  }
}

/**
 * Unchanged: no letter at all, or the same bytes as when the attempt started. Without a start noted (written
 * before P1-33, or lost) an existing letter cannot be judged, so it passes, as the hook lets it.
 */
export async function letterUnchanged(runDir: string, letter: string): Promise<boolean> {
  const current = await fingerprintOf(letter);
  if (current === null) return true;
  try {
    const start = JSON.parse(await readFile(path.join(runDir, LETTER_START), 'utf8')) as {
      fingerprint?: unknown;
    };
    return start.fingerprint === current;
  } catch {
    return false;
  }
}

/** Whether an assignee of `tribe` has its letter checked after the session rather than by the Stop hook. */
export const checksLetterAfter = (ctx: Context, tribe: TribeId): boolean =>
  ctx.limits[tribe]?.handover_check === 'after_session';

/** The reminder after round `round`: resumed when the tribe can and the CLI named its session, else fresh. */
function reminderOf(ctx: Context, quest: Quest, heard: Heard, runDir: string, round: number): SpawnRequest {
  const { request, result } = heard;
  const run_dir = path.join(runDir, `${REMINDER_DIR}${String(round + 1)}`);
  const prompt = letterReminderPrompt(request.prompt, quest, handoverPath(ctx.root, quest.id), ctx.templates);
  const canResume = ctx.limits[request.character.tribe]?.resume === true && result.session_id !== '';
  const { resume: _, ...fresh } = request;
  return canResume
    ? { ...fresh, run_dir, prompt, resume: { session_id: result.session_id } }
    : { ...fresh, run_dir, prompt };
}

/**
 * The reminders of an assignee's session (spawnSequel): after a session that ended of itself, not at a usage
 * limit and without a question, with the letter unchanged since the attempt started.
 */
export function letterSequel(ctx: Context, quest: Quest, runDir: string): Sequel {
  return {
    next: async (heard, round): Promise<Follow | undefined> => {
      const { result, request } = heard;
      if (round >= LETTER_REMINDERS_MAX || result.outcome !== 'completed' || result.rate_limited)
        return undefined;
      if (result.question !== undefined || request.handover === undefined) return undefined;
      if (!(await letterUnchanged(runDir, request.handover))) return undefined;
      return {
        request: reminderOf(ctx, quest, heard, runDir, round),
        why: 'the handover letter is unchanged',
      };
    },
  };
}

/**
 * After the assignee's session of such a tribe, inside the tick: a letter still unchanged after the reminders is
 * told to the judge in the journal, as the hook's let-through tells it (ADR 0010). False when nothing was said.
 */
export async function noteUnchangedLetter(
  ctx: Context,
  quest: Quest,
  n: number,
  session: string,
): Promise<boolean> {
  const runDir = inKingdom(ctx.root, runDirOf(quest, n, 'assignee'));
  if (!(await letterUnchanged(runDir, handoverPath(ctx.root, quest.id)))) return false;
  const message =
    "Finished with handover.md unchanged since the attempt started, after the Steward's reminders.";
  await ctx.record.note({
    type: 'agent.notification',
    actor: STEWARD,
    data: { notification_type: 'handover_unchanged', message },
    quest,
    session,
  });
  return true;
}
