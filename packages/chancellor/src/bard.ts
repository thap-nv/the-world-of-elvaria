// askBard: the Bard's session of the chronicle (P2-06b, W10; ADR 0017): one session for the day's ledger (one model
// call), in role `bard`, within its own caps, with no tool whatever its class allows: it reads its prompt only. The reply
// is plain text, the prose. Nothing is written or checked against the ledger here: the caller redacts the text, holds it
// against the ledger (checkChronicle) and, refused, asks once more with chronicleIssueText's lines.
import { err, ok } from '@elvaria/domain';
import { buildChroniclePrompt } from '@elvaria/runner-core';
import type { ChronicleIssue, Result } from '@elvaria/domain';
import type { ChronicleContext, ReplyCheck } from '@elvaria/runner-core';

import { BARD_MAX_MINUTES, BARD_MAX_TURNS } from './constants.ts';
import { hear, sessionIdsOf } from './session.ts';
import type { ChancellorFailure, ChancellorSession } from './session.ts';

/** What the Bard is told of an issue on its second try. */
export function chronicleIssueText(issue: ChronicleIssue): string {
  if (issue.code === 'unknown_quest') return `names quest ${issue.quest}, which the ledger does not hold`;
  if (issue.code === 'idle_character') return `names ${issue.name}, who is not among the day's characters`;
  return `is ${String(issue.length)} characters long, over the ${String(issue.max)} allowed`;
}

const textCheck = (value: unknown): ReplyCheck<string> => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text === '' ? { ok: false, issues: ['the reply is empty'] } : { ok: true, value: text };
};

export interface BardAnswer {
  readonly text: string;
  readonly session_ids: readonly string[];
  readonly tokens: number;
}

/** Why there is no prose to use, and what the session spent all the same (0 when it said nothing). */
export interface BardFailure {
  readonly failure: ChancellorFailure;
  readonly tokens: number;
  readonly session_ids: readonly string[];
}

/** The Bard's own role and caps on a session the caller opened for it, and no tool: its deny list stays. */
export const asBard = (session: ChancellorSession): ChancellorSession => ({
  ...session,
  characterClass: { ...session.characterClass, tools: { ...session.characterClass.tools, allow: [] } },
  role: 'bard',
  budget: { max_turns: BARD_MAX_TURNS, max_minutes: BARD_MAX_MINUTES },
});

/** One session for the ledger; `signal` ends it (the Steward stopped), with failure `stopped`. */
export async function askBard(
  context: ChronicleContext,
  session: ChancellorSession,
  signal?: AbortSignal,
): Promise<Result<BardAnswer, BardFailure>> {
  const prompt = buildChroniclePrompt(context, session.templates);
  const heard = await hear(asBard(session), { prompt, check: textCheck, signal });
  if (!heard.ok) return err({ failure: heard.error, tokens: 0, session_ids: [] });
  const { reply, result } = heard.value;
  const spent = { tokens: result.usage.tokens, session_ids: sessionIdsOf(result) };
  if (!reply.ok) return err({ failure: { code: 'invalid_reply', issues: reply.issues }, ...spent });
  return ok({ text: reply.value, ...spent });
}
