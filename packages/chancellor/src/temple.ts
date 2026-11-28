// askTemple: the Monk's session of the Temple (temple-first plan, PS-12f; ADR 0027): one session for the evidence pack
// (one model call), in role `monk`, within the Temple's own caps, its reply the temple-reply structured output. The
// reply is checked against the contract, then against the pack it answered (templeReplyIssues): on a tribe without a
// JSON Schema flag a reply that breaks either is tried once more, told what was wrong (spawnParsed). Nothing is written
// here: the caller turns the reply into one temple_report command (templeCommands) and the Steward applies it.
import { TempleReplySchema, contractOf, templeReplyIssues } from '@elvaria/domain';
import { buildTemplePrompt, issueLines } from '@elvaria/runner-core';
import type {
  Result,
  TempleEvidence,
  TempleReply,
  TempleReplyIssue,
  TempleReplyIssueCode,
} from '@elvaria/domain';
import type { JsonSchema, ReplyCheck, TempleContext } from '@elvaria/runner-core';

import { TEMPLE_MAX_MINUTES, TEMPLE_MAX_TURNS } from './constants.ts';
import { forTheCli } from './reply.ts';
import { speak, withoutTools } from './session.ts';
import type { ChancellorSession, Spent, SpokenFailure } from './session.ts';

/** `--json-schema` of the Temple: docs/schemas/temple-reply.schema.json, less what the CLI refuses. */
export const TEMPLE_REPLY_JSON_SCHEMA = forTheCli(
  contractOf('temple-reply', TempleReplySchema),
) as JsonSchema;

/** What the Monk is told of an issue on a retry: where it is, and what is wrong. */
const ISSUE_TEXT: Readonly<Record<TempleReplyIssueCode, (about: string) => string>> = {
  twice_decided: (about) => `decisions: group ${about} is decided twice`,
  undecided: (about) => `decisions: no decision for group ${about}`,
  unknown_group: (about) => `decisions: ${about} is not a group of the pack`,
  foreign_verdict: (about) => `decisions: verdict ${about} is not one of its group's`,
  too_many_lines: () => 'decisions: too many lessons',
  too_many_letters: () => 'decisions: too many letters',
  unknown_review: (about) => `reviews: ${about} is not a line the pack names worth a review`,
  twice_reviewed: (about) => `reviews: ${about} is reviewed twice`,
};

export const templeIssueText = (issue: TempleReplyIssue): string => ISSUE_TEXT[issue.code](issue.about ?? '');

export type TempleCheck = ReplyCheck<TempleReply>;

/** The reply against the contract, then against the pack: each group decided once, each verdict from its group. */
export const templeCheckOf =
  (evidence: TempleEvidence) =>
  (value: unknown): TempleCheck => {
    const parsed = TempleReplySchema.safeParse(value);
    if (!parsed.success) return { ok: false, issues: issueLines(parsed.error.issues) };
    const issues = templeReplyIssues(parsed.data, evidence).map(templeIssueText);
    return issues.length === 0 ? { ok: true, value: parsed.data } : { ok: false, issues };
  };

/** The reply, the session's id and its retry's when there was one, and what both spent. */
export type TempleAnswer = Spent & { readonly reply: TempleReply };

export type TempleFailure = SpokenFailure;

/**
 * The Monk's own role and caps, on a session the caller opened for it, and no tool whatever its class allows: the
 * Temple's session reads its prompt only (temple-first plan, PS-12d: no tool to read files); its deny list stays.
 */
export const asMonk = (session: ChancellorSession): ChancellorSession =>
  withoutTools(session, 'monk', { max_turns: TEMPLE_MAX_TURNS, max_minutes: TEMPLE_MAX_MINUTES });

/** One session for the pack; `signal` ends it (the Steward stopped), with failure `stopped`. */
export async function askTemple(
  context: TempleContext,
  session: ChancellorSession,
  signal?: AbortSignal,
): Promise<Result<TempleAnswer, TempleFailure>> {
  const prompt = buildTemplePrompt(context, session.templates);
  const check = templeCheckOf(context.evidence);
  return speak(asMonk(session), { prompt, schema: TEMPLE_REPLY_JSON_SCHEMA, check, signal });
}
