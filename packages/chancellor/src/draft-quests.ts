// draftQuests: one utterance of the owner → quest drafts, through one session of the Chancellor (implementation-plan
// §3.11). The session has no tool and reads only its prompt (buildChancellorPrompt); its reply is the quest-draft
// structured output, or, on a tribe without it, JSON in text with one retry (§3.14). The drafts are then held
// against the kingdom's files (screenDrafts). Nothing is written here: the caller turns the drafts into inbox
// commands (draftCommands), and the Steward makes the quests (ADR 0005).
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { err, ok } from '@elvaria/domain';
import { buildChancellorPrompt, toolPolicyOf } from '@elvaria/runner-core';
import type { CharacterClass, ChancellorChoice, QuestDraftFile, Result } from '@elvaria/domain';
import type {
  AgentRunner,
  BuiltPrompt,
  ChancellorContext,
  PromptTemplates,
  RunOutcome,
  SpawnRequest,
} from '@elvaria/runner-core';

import { CHANCELLOR_MAX_MINUTES, CHANCELLOR_MAX_TURNS, MS_PER_MINUTE, RETRY_DIR } from './constants.ts';
import {
  QUEST_DRAFT_JSON_SCHEMA,
  checkReply,
  checkTextReply,
  replyFormatBlock,
  retryBlock,
} from './reply.ts';
import { screenDrafts } from './screen.ts';
import type { ReplyCheck } from './reply.ts';
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
  readonly session_id: string;
  readonly tokens: number;
  readonly reply: ReplyCheck;
}

const native = (session: ChancellorSession): boolean => session.choice.structured_output === 'native';

function requestOf(session: ChancellorSession, prompt: BuiltPrompt, runDir: string): SpawnRequest {
  const { character } = session.choice;
  return {
    role: 'chancellor',
    character,
    cwd: runDir,
    prompt,
    permissions: toolPolicyOf({ role: 'chancellor', characterClass: session.characterClass, character }),
    budget: { max_turns: CHANCELLOR_MAX_TURNS, max_minutes: CHANCELLOR_MAX_MINUTES },
    ...(native(session) ? { structured: QUEST_DRAFT_JSON_SCHEMA } : {}),
    env: session.env,
    run_dir: runDir,
  };
}

/** One session: its last text and its result; killed when it outlasts the timeout. */
async function hear(
  session: ChancellorSession,
  prompt: BuiltPrompt,
  runDir: string,
): Promise<Result<Heard, ChancellorFailure>> {
  await mkdir(runDir, { recursive: true });
  const running = await session.runner.spawn(requestOf(session, prompt, runDir));
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
  return ok({ session_id: result.session_id, tokens: result.usage.tokens, reply });
}

/** The structured output, or the last text where the schema was in the prompt; undefined when there is none. */
function replyOf(session: ChancellorSession, structured: unknown, text: string | undefined) {
  if (native(session)) return structured === undefined ? undefined : checkReply(structured);
  return text === undefined ? undefined : checkTextReply(text);
}

/** The system part names the reply's format where the CLI cannot enforce it. */
const promptFor = (context: ChancellorContext, session: ChancellorSession): BuiltPrompt => {
  const prompt = buildChancellorPrompt(context, session.templates);
  return native(session) ? prompt : { ...prompt, system: `${prompt.system}\n\n${replyFormatBlock()}` };
};

interface Hearing {
  readonly sessions: readonly Heard[];
  /** The reply that counts: the last session's. */
  readonly reply: ReplyCheck;
}

const hearingOf = (first: Heard, second?: Heard): Hearing => ({
  sessions: second === undefined ? [first] : [first, second],
  reply: (second ?? first).reply,
});

/** The sessions of one utterance: one, and a second for a text reply that could not be used. */
async function heardAll(
  context: ChancellorContext,
  session: ChancellorSession,
): Promise<Result<Hearing, ChancellorFailure>> {
  const prompt = promptFor(context, session);
  const first = await hear(session, prompt, session.run_dir);
  if (!first.ok) return first;
  if (first.value.reply.ok || native(session)) return ok(hearingOf(first.value));
  const again = { ...prompt, user: `${prompt.user}\n\n${retryBlock(first.value.reply.issues)}` };
  const second = await hear(session, again, path.join(session.run_dir, RETRY_DIR));
  return second.ok ? ok(hearingOf(first.value, second.value)) : second;
}

const questionOf = (file: QuestDraftFile): string | undefined =>
  file.drafts.find((draft) => draft.question !== undefined)?.question;

export async function draftQuests(
  context: ChancellorContext,
  session: ChancellorSession,
): Promise<Result<ChancellorReply, ChancellorFailure>> {
  const heard = await heardAll(context, session);
  if (!heard.ok) return heard;
  const { reply, sessions } = heard.value;
  if (!reply.ok) return err({ code: 'invalid_reply', issues: reply.issues });
  const question = questionOf(reply.value);
  return ok({
    ...screenDrafts(reply.value.drafts, context),
    ...(question === undefined ? {} : { question }),
    session_ids: sessions.map(({ session_id }) => session_id),
    tokens: sessions.reduce((sum, { tokens }) => sum + tokens, 0),
  });
}
