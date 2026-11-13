// draftQuests: one utterance of the owner → quest drafts, through one session of the Chancellor (implementation-plan
// §3.11). The session has no tool and reads only its prompt (buildChancellorPrompt); its reply is the quest-draft
// structured output, or, on a tribe without it, JSON in text with one retry (session.ts). The drafts are then held
// against the kingdom's files (screenDrafts). Nothing is written here: the caller turns the drafts into inbox commands
// (draftCommands), and the Steward makes the quests (ADR 0005).
import { err, ok } from '@elvaria/domain';
import { buildChancellorPrompt } from '@elvaria/runner-core';
import type { QuestDraftFile, Result } from '@elvaria/domain';
import type { ChancellorContext } from '@elvaria/runner-core';

import { QUEST_DRAFT_JSON_SCHEMA, checkReply } from './reply.ts';
import { screenDrafts } from './screen.ts';
import { hear, sessionIdsOf } from './session.ts';
import type { ScreenedDrafts } from './screen.ts';
import type { ChancellorFailure, ChancellorSession } from './session.ts';

export interface ChancellorReply extends ScreenedDrafts {
  /** The Chancellor's one follow-up question, even when its draft was dropped: the owner reads it. */
  readonly question?: string;
  readonly session_ids: readonly string[];
  readonly tokens: number;
}

const questionOf = (file: QuestDraftFile): string | undefined =>
  file.drafts.find((draft) => draft.question !== undefined)?.question;

export async function draftQuests(
  context: ChancellorContext,
  session: ChancellorSession,
): Promise<Result<ChancellorReply, ChancellorFailure>> {
  const prompt = buildChancellorPrompt(context, session.templates);
  const heard = await hear(session, { prompt, schema: QUEST_DRAFT_JSON_SCHEMA, check: checkReply });
  if (!heard.ok) return heard;
  const { reply, result } = heard.value;
  if (!reply.ok) return err({ code: 'invalid_reply', issues: reply.issues });
  const question = questionOf(reply.value);
  return ok({
    ...screenDrafts(reply.value.drafts, context),
    ...(question === undefined ? {} : { question }),
    session_ids: sessionIdsOf(result),
    tokens: result.usage.tokens,
  });
}
