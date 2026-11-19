// What a session of the Chancellor's office spent (fix/run-221-followups, (b) of (248)): the owner's words, a triage
// of memos (the Steward's job or `elvaria triage`) and an amendment's author each answer with the tokens the session
// reported, and a `chancellor.answered` line puts them in the log, where the Steward's mana estimate counts them as a
// quest's sessions from its next start (ADR 0009). A session with no reply to use writes none: its failure says why.
import type { ChancellorMatter } from '@elvaria/domain';
import type { ChancellorSession } from '@elvaria/chancellor';

import { recordChancellorAnswered } from '../events.ts';
import type { KingdomContext } from '../kingdom-context.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Writes the line; one that cannot be written is said, and what the session answered stands. */
export async function recordAnswered(
  ctx: KingdomContext,
  session: Pick<ChancellorSession, 'choice'>,
  matter: ChancellorMatter,
  tokens: number,
): Promise<void> {
  try {
    await recordChancellorAnswered(ctx, session.choice.character, { matter, tokens });
  } catch (error) {
    ctx.io.err(ctx.t('cli.say.spent_unrecorded', { problem: messageOf(error) }));
  }
}
