// draftQuests: one utterance of the owner → quest drafts, through one session of the Chancellor (implementation-plan
// §3.11). The session has no tool and reads only its prompt (buildChancellorPrompt); its reply is the quest-draft
// structured output, or, on a tribe without it, JSON in text with one retry (session.ts). The drafts are then held
// against the kingdom's files (screenDrafts). When the screen drops drafts for the Chancellor's own drafting (the quest
// template, the council, the brief: RETURNED_REASONS, PS-06), one more session reads its first reply and why, and
// writes it again; what still misses is dropped. Nothing is written here: the caller turns the drafts into inbox
// commands (draftCommands), and the Steward makes the quests (ADR 0005).
import path from 'node:path';

import { err, ok } from '@elvaria/domain';
import { buildChancellorPrompt } from '@elvaria/runner-core';
import type { Brief, Council, QuestDraftFile, Result } from '@elvaria/domain';
import type { ChancellorContext } from '@elvaria/runner-core';

import { QUEST_DRAFT_JSON_SCHEMA, checkReply } from './reply.ts';
import { RETURNED_REASONS, screenDrafts } from './screen.ts';
import { hear, sessionIdsOf } from './session.ts';
import type { DroppedDraft, ScreenedDrafts } from './screen.ts';
import type { ChancellorFailure, ChancellorSession } from './session.ts';

export interface ChancellorReply extends ScreenedDrafts {
  /** The Chancellor's one follow-up question, even when its draft was dropped: the owner reads it. */
  readonly question?: string;
  /** The brief of work that goes through the council (PS-06), when its plan draft was kept. */
  readonly brief?: Brief;
  readonly session_ids: readonly string[];
  readonly tokens: number;
}

/** The second session's own folder, so the first one's prompt and output stay readable. */
export const AGAIN_DIR = 'again';

const questionOf = (file: QuestDraftFile): string | undefined =>
  file.drafts.find((draft) => draft.question !== undefined)?.question;

/** One session of the Chancellor and its checked reply. */
async function heard(context: ChancellorContext, session: ChancellorSession) {
  const prompt = buildChancellorPrompt(context, session.templates);
  const answer = await hear(session, { prompt, schema: QUEST_DRAFT_JSON_SCHEMA, check: checkReply });
  if (!answer.ok) return answer;
  const { reply, result } = answer.value;
  if (!reply.ok) return err<ChancellorFailure>({ code: 'invalid_reply', issues: reply.issues });
  return ok({ file: reply.value, ids: sessionIdsOf(result), tokens: result.usage.tokens });
}

type Heard = Extract<Awaited<ReturnType<typeof heard>>, { ok: true }>['value'];

/** Why a dropped draft came back, in English, for the Chancellor's second try. */
function problemOf(dropped: DroppedDraft, council: Council): string {
  const head = `${dropped.ref} «${dropped.title}»`;
  if (dropped.reason === 'template')
    return `${head}: its description misses the quest template: ${dropped.detail ?? ''}`;
  if (dropped.reason === 'needs_council')
    return `${head}: the work is large enough for the council (a session draft of rank ${council.from_rank} or above, or ${council.from_areas} tags over as many areas): draft one quest of kind plan for a mage and a brief that names it`;
  if (dropped.reason === 'needs_brief')
    return `${head}: a plan for work of the council needs a brief that names it in plan_ref`;
  return `${head}: the brief names this draft, whose kind delivers no sub-quests`;
}

/** The reply as the owner gets it: what the screen kept, the question, and the brief of a kept plan. */
function replyOf(screened: ScreenedDrafts, file: QuestDraftFile, tries: readonly Heard[]): ChancellorReply {
  const question = questionOf(file);
  const brief = file.brief;
  const briefed = brief !== undefined && screened.kept.some(({ ref }) => ref === brief.plan_ref);
  return {
    ...screened,
    ...(question === undefined ? {} : { question }),
    ...(briefed ? { brief } : {}),
    session_ids: tries.flatMap(({ ids }) => ids),
    tokens: tries.reduce((sum, { tokens }) => sum + tokens, 0),
  };
}

export async function draftQuests(
  context: ChancellorContext,
  session: ChancellorSession,
): Promise<Result<ChancellorReply, ChancellorFailure>> {
  const first = await heard(context, session);
  if (!first.ok) return first;
  const screened = screenDrafts(first.value.file.drafts, context, first.value.file.brief);
  const back = screened.dropped.filter(({ reason }) => RETURNED_REASONS.has(reason));
  if (back.length === 0) return ok(replyOf(screened, first.value.file, [first.value]));
  const returned = {
    reply: JSON.stringify(first.value.file, null, 2),
    problems: back.map((dropped) => problemOf(dropped, context.council)),
  };
  const again = await heard(
    { ...context, returned },
    { ...session, run_dir: path.join(session.run_dir, AGAIN_DIR) },
  );
  // The second try failed (no reply, a usage limit): the first reply stands, with its drafts dropped and why.
  if (!again.ok) return ok(replyOf(screened, first.value.file, [first.value]));
  const { file } = again.value;
  return ok(replyOf(screenDrafts(file.drafts, context, file.brief), file, [first.value, again.value]));
}
