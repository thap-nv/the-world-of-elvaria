// decideAmendment: an amendment's author decides it (implementation-plan §3.16.2, PS-22b; ADR 0024), in one session
// of the Chancellor's office with no tool: the Chancellor for a quest it drafted, the mage of the plan for one of its
// sub-quests. The reply is the amendment-decision structured output. amendmentCommand holds an acceptance against
// kingdom.delegation (amendmentHolds, with the memo's files matched against the territory's protected paths) and
// makes the one decide_amendment command the Steward applies (ADR 0005): within the delegation the description is
// rewritten and the quest goes on; beyond it, or when the author hands it on, the quest asks the owner.
import {
  AmendmentDecisionFileSchema,
  amendmentHolds,
  contractOf,
  err,
  ok,
  opensOnly,
  sharedGlobsOf,
} from '@elvaria/domain';
import { buildAmendmentPrompt, issueLines } from '@elvaria/runner-core';
import type {
  AmendmentDecisionFile,
  Delegation,
  DelegationHold,
  InboxCommandInput,
  Memo,
  Quest,
  Result,
  Territory,
} from '@elvaria/domain';
import type { AmendmentContext, JsonSchema, ReplyCheck } from '@elvaria/runner-core';

import { protectedRefsOf } from './protected-refs.ts';
import { forTheCli } from './reply.ts';
import { hear, sessionIdsOf } from './session.ts';
import type { CommandHeader } from './commands.ts';
import type { ChancellorFailure, ChancellorSession } from './session.ts';

/** `--json-schema` of the author: docs/schemas/amendment-decision.schema.json, less what the CLI refuses. */
export const AMENDMENT_DECISION_JSON_SCHEMA = forTheCli(
  contractOf('amendment-decision', AmendmentDecisionFileSchema),
) as JsonSchema;

export const amendmentCheck = (value: unknown): ReplyCheck<AmendmentDecisionFile> => {
  const parsed = AmendmentDecisionFileSchema.safeParse(value);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, issues: issueLines(parsed.error.issues) };
};

export interface AmendmentReply {
  readonly decision: AmendmentDecisionFile;
  readonly session_ids: readonly string[];
  readonly tokens: number;
}

/** One session for the amendment; `signal` ends it (the Steward stopped), with failure `stopped`. */
export async function decideAmendment(
  context: AmendmentContext,
  session: ChancellorSession,
  signal?: AbortSignal,
): Promise<Result<AmendmentReply, ChancellorFailure>> {
  const prompt = buildAmendmentPrompt(context, session.templates);
  const heard = await hear(session, {
    prompt,
    schema: AMENDMENT_DECISION_JSON_SCHEMA,
    check: amendmentCheck,
    signal,
  });
  if (!heard.ok) return heard;
  const { reply, result } = heard.value;
  if (!reply.ok) return err({ code: 'invalid_reply', issues: reply.issues });
  return ok({ decision: reply.value, session_ids: sessionIdsOf(result), tokens: result.usage.tokens });
}

export type DecideAmendmentCommand = Extract<InboxCommandInput, { kind: 'decide_amendment' }>;

export interface AmendmentInput {
  /** The author's decision; or the owner's turn the caller sets when no author could decide (no session, a failure). */
  readonly decision: Pick<AmendmentDecisionFile, 'decision' | 'note' | 'ask' | 'description'>;
  readonly memo: Memo;
  /** The quest the memo contests, as the author read it. */
  readonly quest: Quest;
  /** The quest's territory: the protected paths the memo's files may name, and its shared paths (R3). */
  readonly territory: Pick<Territory, 'laws' | 'shared_paths'> | undefined;
  /** The kingdom's quests: the quest's party contract, and the quests holding a scope (amendmentHolds). */
  readonly quests: readonly Quest[];
  readonly delegation: Delegation;
  /** A header of source `chancellor`. */
  readonly header: CommandHeader;
}

export interface AmendmentOutcome {
  readonly command: DecideAmendmentCommand;
  /** What holds the amendment for the owner; none when the Steward applies the author's decision alone. */
  readonly holds: readonly DelegationHold[];
}

/**
 * What holds the decision for the owner (amendmentHolds): a referral always; an acceptance when it touches a matter
 * the owner keeps (delegation.ask), its quest's rank is above delegation.max_rank (unless it only opens files inside
 * its party's contract, up to the plan's rank), or the files it opens meet a scope another quest holds (R3).
 */
const holdsOf = (input: AmendmentInput): DelegationHold[] =>
  amendmentHolds(
    {
      decision: input.decision,
      quest: input.quest,
      refs: input.memo.refs,
      protected_refs: protectedRefsOf(input.memo.refs, input.territory),
      quests: input.quests,
      shared: sharedGlobsOf(input.territory),
    },
    input.delegation,
  );

function payloadOf(
  input: AmendmentInput,
  holds: readonly DelegationHold[],
): DecideAmendmentCommand['payload'] {
  const { decision, memo, quest } = input;
  const base = { memo: memo.id, note: decision.note };
  if (holds.length > 0) return { ...base, decision: 'owner', holds: [...holds] };
  if (decision.decision !== 'accepted') return { ...base, decision: 'rejected' };
  const { description } = decision;
  // An acceptance that leaves the description as it reads only opens files: the Steward rewrites nothing.
  return description === undefined || opensOnly(decision, quest)
    ? { ...base, decision: 'accepted' }
    : { ...base, decision: 'accepted', description, expected_updated_at: quest.updated_at };
}

export function amendmentCommand(input: AmendmentInput): AmendmentOutcome {
  const holds = holdsOf(input);
  const payload = payloadOf(input, holds);
  return { command: { ...input.header, kind: 'decide_amendment', payload }, holds };
}
