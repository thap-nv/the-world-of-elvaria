// decideAmendment: an amendment's author decides it (implementation-plan §3.16.2, PS-22b; ADR 0024), in one session
// of the Chancellor's office with no tool: the Chancellor for a quest it drafted, the mage of the plan for one of its
// sub-quests. The reply is the amendment-decision structured output. amendmentCommand holds an acceptance against
// kingdom.delegation (delegationHolds, with the memo's files matched against the territory's protected paths) and
// makes the one decide_amendment command the Steward applies (ADR 0005): within the delegation the description is
// rewritten and the quest goes on; beyond it, or when the author hands it on, the quest asks the owner.
import { AmendmentDecisionFileSchema, contractOf, delegationHolds, err, ok } from '@elvaria/domain';
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
  /** The quest's territory: the protected paths the memo's files may name. */
  readonly territory: Pick<Territory, 'laws'> | undefined;
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
 * What holds the decision for the owner: a referral always; an acceptance when it touches a matter the owner keeps
 * (delegation.ask) or the quest's rank is above delegation.max_rank. A rejection keeps the description the owner saw,
 * and the memo's files are evidence, not work outside a scope: neither holds anything.
 */
function holdsOf(input: AmendmentInput): DelegationHold[] {
  const { decision, quest, memo } = input;
  if (decision.decision === 'rejected') return [];
  const memos = [
    {
      refs: memo.refs,
      territory: quest.territory,
      protected_refs: protectedRefsOf(memo.refs, input.territory),
    },
  ];
  const work = { rank: quest.rank, territory: quest.territory, scope_paths: quest.scope_paths };
  const action = decision.decision === 'owner' ? 'owner' : 'merge';
  return delegationHolds(
    { action, work, memos, asks: decision.ask },
    { ...input.delegation, same_scope: false },
  );
}

export function amendmentCommand(input: AmendmentInput): AmendmentOutcome {
  const { decision, memo, quest, header } = input;
  const holds = holdsOf(input);
  const base = { memo: memo.id, note: decision.note };
  const payload: DecideAmendmentCommand['payload'] =
    holds.length > 0
      ? { ...base, decision: 'owner', holds }
      : decision.decision === 'accepted' && decision.description !== undefined
        ? {
            ...base,
            decision: 'accepted',
            description: decision.description,
            expected_updated_at: quest.updated_at,
          }
        : { ...base, decision: decision.decision === 'accepted' ? 'accepted' : 'rejected' };
  return { command: { ...header, kind: 'decide_amendment', payload }, holds };
}
