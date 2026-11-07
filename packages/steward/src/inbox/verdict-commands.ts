// The owner's word on work that waits for the royal seal (implementation-plan §2.5, §2.6): `seal` (done) or `return`
// (back to the assignee with a note). Each is a verdict file of its own, `verdicts/<quest>-<n>-user.json`
// (`verifier_id: user`, P1-04), beside the judge's; it weighs three in the assignee's windows. The file is written
// only once the table allows the move, so a refused command leaves no verdict behind.
import { FAIL_NOTES_MIN_LENGTH, findTransition } from '@elvaria/domain';
import type { FailKind, Quest } from '@elvaria/domain';

import { OWNER } from '../record.ts';
import { ownerVerdictOf } from '../review/verdict-file.ts';
import { moveOnVerdict, recordVerdict, ritualOf } from '../verdicts.ts';
import { APPLIED, rejected } from './quest-commands.ts';
import type { Context } from '../context.ts';
import type { MovePayload } from '../record.ts';
import type { OwnerWord } from '../review/verdict-file.ts';
import type { Outcome } from './quest-commands.ts';

/** The owner's verdict, then the move with the assignee's windows, then its level. */
async function judgeAsOwner(
  ctx: Context,
  quest: Quest,
  word: OwnerWord,
  event: MovePayload,
): Promise<Outcome> {
  const allowed = findTransition(quest, event.type);
  if (!allowed.ok) return rejected(allowed.error.code);
  const ritual = ritualOf(ctx, quest);
  if (ritual === undefined) return rejected('unknown_ritual');
  const made = ownerVerdictOf(ctx, quest, ritual.id, word);
  if (!made.ok) return rejected(made.error);
  const written = await recordVerdict(ctx, quest, made.value, OWNER);
  if (!written.ok) return rejected(written.error);
  const verdict = { ...written.value, result: word.result };
  const moved = await moveOnVerdict(ctx, quest, verdict, { event, actor: 'user' });
  return moved.ok ? APPLIED : rejected(moved.error);
}

/** The royal seal: the owner's pass on the work, weighed three times (§2.6). */
export const seal = (ctx: Context, quest: Quest, note: string | undefined): Promise<Outcome> =>
  judgeAsOwner(
    ctx,
    quest,
    { result: 'pass', notes: note },
    note === undefined ? { type: 'seal' } : { type: 'seal', note },
  );

/**
 * The owner returns the work: a fail verdict needs specific notes (≥ 20 characters) and a fail_kind, `other`
 * unless the command names one (schema verdict, owner's decision after P0-03).
 */
export async function giveBack(
  ctx: Context,
  quest: Quest,
  notes: string,
  failKind: FailKind | undefined,
): Promise<Outcome> {
  if (notes.trim().length < FAIL_NOTES_MIN_LENGTH) return rejected('notes_too_short');
  const word = { result: 'fail', notes, fail_kind: failKind ?? 'other' } as const;
  return judgeAsOwner(ctx, quest, word, { type: 'return' });
}
