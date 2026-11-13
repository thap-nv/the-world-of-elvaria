// triageMemos: the Chancellor's triage of a batch of memos (implementation-plan §3.16.3, PS-03b; ADR 0024): one session
// for the whole batch (one model call), its reply the memo-triage structured output, checked against the contract and
// against the batch: every memo of it decided once, no other named. The drafts of its new quests are held against the
// kingdom's files (screenDrafts). Nothing is written here: triageCommands holds each decision against
// kingdom.delegation and makes the inbox commands, and the Steward applies them (ADR 0005).
import { MemoTriageFileSchema, contractOf, err, ok } from '@elvaria/domain';
import { buildTriagePrompt, issueLines } from '@elvaria/runner-core';
import type { MemoId, MemoTriageFile, Result, TriageDecision } from '@elvaria/domain';
import type { JsonSchema, ReplyCheck, TriageContext } from '@elvaria/runner-core';

import { forTheCli } from './reply.ts';
import { screenDrafts } from './screen.ts';
import { hear, sessionIdsOf } from './session.ts';
import type { ScreenedDrafts } from './screen.ts';
import type { ChancellorFailure, ChancellorSession } from './session.ts';

/** `--json-schema` of the triage: docs/schemas/memo-triage.schema.json, less what the CLI refuses. */
export const MEMO_TRIAGE_JSON_SCHEMA = forTheCli(
  contractOf('memo-triage', MemoTriageFileSchema),
) as JsonSchema;

export type TriageCheck = ReplyCheck<MemoTriageFile>;

/** The reply against the contract, then against the batch: each of its memos decided, and no memo outside it. */
export const triageCheckOf =
  (batch: readonly MemoId[]) =>
  (value: unknown): TriageCheck => {
    const parsed = MemoTriageFileSchema.safeParse(value);
    if (!parsed.success) return { ok: false, issues: issueLines(parsed.error.issues) };
    const named = parsed.data.decisions.map(({ memo }) => memo);
    const issues = [
      ...batch.filter((id) => !named.includes(id)).map((id) => `decisions: no decision for memo ${id}`),
      ...named.flatMap((id, index) =>
        batch.includes(id) ? [] : [`decisions.${String(index)}.memo: ${id} is not a memo below`],
      ),
    ];
    return issues.length === 0 ? { ok: true, value: parsed.data } : { ok: false, issues };
  };

export interface TriageReply {
  readonly decisions: readonly TriageDecision[];
  /** The drafts of its new quests, held against the kingdom's files. */
  readonly drafts: ScreenedDrafts;
  readonly session_ids: readonly string[];
  readonly tokens: number;
}

/** One session for the batch; `signal` ends it (the Steward stopped), with failure `stopped`. */
export async function triageMemos(
  context: TriageContext,
  session: ChancellorSession,
  signal?: AbortSignal,
): Promise<Result<TriageReply, ChancellorFailure>> {
  const prompt = buildTriagePrompt(context, session.templates);
  const check = triageCheckOf(context.memos.map(({ memo }) => memo.id));
  const heard = await hear(session, { prompt, schema: MEMO_TRIAGE_JSON_SCHEMA, check, signal });
  if (!heard.ok) return heard;
  const { reply, result } = heard.value;
  if (!reply.ok) return err({ code: 'invalid_reply', issues: reply.issues });
  return ok({
    decisions: reply.value.decisions,
    drafts: screenDrafts(reply.value.drafts, context),
    session_ids: sessionIdsOf(result),
    tokens: result.usage.tokens,
  });
}
