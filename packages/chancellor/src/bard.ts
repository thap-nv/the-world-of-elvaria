// askBard: the Bard's session of the chronicle (P2-06b, W10; ADR 0017): one session for the day's ledger (one model
// call), in role `bard`, within its own caps, with no tool whatever its class allows: it reads its prompt only. The reply
// is plain text, the prose. Nothing is written or checked against the ledger here: the caller redacts the text, holds it
// against the ledger (checkChronicle) and, refused, asks once more with chronicleIssueText's lines.
import { buildChroniclePrompt } from '@elvaria/runner-core';
import type { ChronicleIssue, Result } from '@elvaria/domain';
import type { Budget, ChronicleContext, ReplyCheck } from '@elvaria/runner-core';

import { BARD_MAX_MINUTES, BARD_MAX_TURNS } from './constants.ts';
import { speak, withoutTools } from './session.ts';
import type { ChancellorSession, Spent, SpokenFailure } from './session.ts';

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

/** The prose, trimmed, the session's id and what it spent. */
export type BardAnswer = Spent & { readonly reply: string };

export type BardFailure = SpokenFailure;

const BARD_BUDGET: Budget = { max_turns: BARD_MAX_TURNS, max_minutes: BARD_MAX_MINUTES };

/**
 * One session for the ledger, on a session the caller opened, in the Bard's role and caps and with no tool (its deny
 * list stays); `signal` ends it (the Steward stopped), with failure `stopped`.
 */
export const askBard = (
  context: ChronicleContext,
  session: ChancellorSession,
  signal?: AbortSignal,
): Promise<Result<BardAnswer, BardFailure>> =>
  speak(withoutTools(session, 'bard', BARD_BUDGET), {
    prompt: buildChroniclePrompt(context, session.templates),
    check: textCheck,
    signal,
  });
