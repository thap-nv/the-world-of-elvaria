// draftQuests: one utterance of the owner → quest drafts, through one session of the Chancellor (implementation-plan
// §3.11). The session has no tool and reads only its prompt (buildChancellorPrompt); its reply is the quest-draft
// structured output, or, on a tribe without it, JSON in text with one retry in a folder of its own (§3.14): the road
// runner-core's spawnParsed shares with the judge's verdict (P1-33). The drafts are then held against the kingdom's
// files (screenDrafts). Nothing is written here: the caller turns the drafts into inbox commands (draftCommands),
// and the Steward makes the quests (ADR 0005).
import { mkdir } from 'node:fs/promises';

import { err, ok } from '@elvaria/domain';
import { buildChancellorPrompt, spawnParsed, toolPolicyOf } from '@elvaria/runner-core';
import type { CharacterClass, ChancellorChoice, QuestDraftFile, Result } from '@elvaria/domain';
import type {
  AgentRunner,
  ChancellorContext,
  PromptTemplates,
  RunOutcome,
  RunResult,
  RunningSession,
  SpawnRequest,
} from '@elvaria/runner-core';

import { CHANCELLOR_MAX_MINUTES, CHANCELLOR_MAX_TURNS, MS_PER_MINUTE } from './constants.ts';
import { QUEST_DRAFT_JSON_SCHEMA, checkReply, checkTextReply, replyIssuesOf } from './reply.ts';
import { screenDrafts } from './screen.ts';
import type { DraftCheck } from './reply.ts';
import type { ScreenedDrafts } from './screen.ts';

export interface ChancellorSession {
  readonly runner: AgentRunner;
  /** selectChancellor: who speaks, and how its reply comes back. */
  readonly choice: ChancellorChoice;
  /** Its class in the registry: the tool policy (no tool at all). */
  readonly characterClass: CharacterClass;
  readonly templates: PromptTemplates;
  /** Absolute `<kingdom>/.runs/chancellor-<id>/`: the session's cwd and its generated files. */
  readonly run_dir: string;
  /** The `ELVARIA_*` context the hook reads (§3.6). */
  readonly env: Readonly<Record<string, string>>;
  /** A session still running after this long is killed; CHANCELLOR_MAX_MINUTES by default. */
  readonly timeout_ms?: number;
}

export type ChancellorFailure =
  | { readonly code: 'rate_limited' }
  | { readonly code: 'timed_out' }
  /** The session ended without a reply to read. */
  | { readonly code: 'no_reply'; readonly outcome: RunOutcome }
  | { readonly code: 'invalid_reply'; readonly issues: readonly string[] };

export interface ChancellorReply extends ScreenedDrafts {
  /** The Chancellor's one follow-up question, even when its draft was dropped: the owner reads it. */
  readonly question?: string;
  readonly session_ids: readonly string[];
  readonly tokens: number;
}

interface Heard {
  readonly result: RunResult;
  readonly reply: DraftCheck;
}

const native = (session: ChancellorSession): boolean => session.choice.structured_output === 'native';

function requestOf(session: ChancellorSession, context: ChancellorContext) {
  const { character } = session.choice;
  return {
    role: 'chancellor',
    character,
    cwd: session.run_dir,
    prompt: buildChancellorPrompt(context, session.templates),
    permissions: toolPolicyOf({ role: 'chancellor', characterClass: session.characterClass, character }),
    budget: { max_turns: CHANCELLOR_MAX_TURNS, max_minutes: CHANCELLOR_MAX_MINUTES },
    structured: QUEST_DRAFT_JSON_SCHEMA,
    env: session.env,
    run_dir: session.run_dir,
  } satisfies SpawnRequest;
}

/**
 * The session: the CLI's own flag, or the schema in the prompt with one retry for a reply that cannot be used
 * (spawnParsed; a fresh session, the Chancellor's prompt being short).
 */
async function spawned(session: ChancellorSession, context: ChancellorContext): Promise<RunningSession> {
  const request = requestOf(session, context);
  if (native(session)) return session.runner.spawn(request);
  return spawnParsed(session.runner, request, { check: replyIssuesOf, resume: false });
}

/** The structured output, or the last text where the schema was in the prompt; undefined when there is none. */
function replyOf(session: ChancellorSession, structured: unknown, text: string | undefined) {
  if (native(session)) return structured === undefined ? undefined : checkReply(structured);
  return text === undefined ? undefined : checkTextReply(text);
}

/** Its last text and its result; killed, with any retry, when it outlasts the timeout. */
async function hear(
  session: ChancellorSession,
  context: ChancellorContext,
): Promise<Result<Heard, ChancellorFailure>> {
  await mkdir(session.run_dir, { recursive: true });
  const running = await spawned(session, context);
  // Written by the signal reader and the timer while wait() runs.
  const seen: { text?: string; late: boolean } = { late: false };
  const reading = (async () => {
    for await (const signal of running.signals) if (signal.kind === 'text') seen.text = signal.text;
  })();
  const timer = setTimeout(
    () => {
      seen.late = true;
      void running.kill('the Chancellor did not answer in time');
    },
    session.timeout_ms ?? CHANCELLOR_MAX_MINUTES * MS_PER_MINUTE,
  );
  const result = await running.wait();
  clearTimeout(timer);
  await reading;
  if (result.rate_limited) return err({ code: 'rate_limited' });
  if (seen.late) return err({ code: 'timed_out' });
  const reply = replyOf(session, result.structured, seen.text);
  if (reply === undefined) return err({ code: 'no_reply', outcome: result.outcome });
  return ok({ result, reply });
}

const questionOf = (file: QuestDraftFile): string | undefined =>
  file.drafts.find((draft) => draft.question !== undefined)?.question;

export async function draftQuests(
  context: ChancellorContext,
  session: ChancellorSession,
): Promise<Result<ChancellorReply, ChancellorFailure>> {
  const heard = await hear(session, context);
  if (!heard.ok) return heard;
  const { reply, result } = heard.value;
  if (!reply.ok) return err({ code: 'invalid_reply', issues: reply.issues });
  const question = questionOf(reply.value);
  return ok({
    ...screenDrafts(reply.value.drafts, context),
    ...(question === undefined ? {} : { question }),
    // The retry, when there was one, is a session of its own: the owner may look both up.
    session_ids: [result.session_id, ...(result.sequels ?? []).map(({ session_id }) => session_id)],
    tokens: result.usage.tokens,
  });
}
