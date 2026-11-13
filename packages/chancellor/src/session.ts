// One session of the Chancellor (implementation-plan §3.11, §3.14): no tool, its prompt only, and a reply that is a
// structured output, given to a CLI with a JSON Schema flag, or JSON in text with one retry in a folder of its own on a
// tribe without it (runner-core's spawnParsed, P1-33). Shared by the owner's words (draftQuests) and the triage of
// memos (triageMemos, PS-03b), which also ends when the Steward stops.
import { mkdir } from 'node:fs/promises';

import { err, ok } from '@elvaria/domain';
import { checkTextReply, spawnParsed, toolPolicyOf } from '@elvaria/runner-core';
import type { CharacterClass, ChancellorChoice, Result } from '@elvaria/domain';
import type {
  AgentRunner,
  BuiltPrompt,
  JsonSchema,
  PromptTemplates,
  ReplyCheck,
  RunOutcome,
  RunResult,
  RunningSession,
  SpawnRequest,
} from '@elvaria/runner-core';

import { CHANCELLOR_MAX_MINUTES, CHANCELLOR_MAX_TURNS, MS_PER_MINUTE } from './constants.ts';

export interface ChancellorSession {
  readonly runner: AgentRunner;
  /** selectChancellor: who speaks, and how its reply comes back. */
  readonly choice: ChancellorChoice;
  /** Its class in the registry: the tool policy (no tool at all). */
  readonly characterClass: CharacterClass;
  readonly templates: PromptTemplates;
  /** Absolute `<kingdom>/.runs/<prefix>-<id>/`: the session's cwd and its generated files. */
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
  | { readonly code: 'invalid_reply'; readonly issues: readonly string[] }
  /** The caller's signal ended it (PS-03b: the Steward stopped while its triage ran). */
  | { readonly code: 'stopped' };

/** What one session is asked: its prompt, the reply's schema, and the check of what comes back. */
export interface Asking<T> {
  readonly prompt: BuiltPrompt;
  readonly schema: JsonSchema;
  readonly check: (value: unknown) => ReplyCheck<T>;
  /** Aborted when nobody waits for the reply any more: the session is killed. */
  readonly signal?: AbortSignal | undefined;
}

export interface Heard<T> {
  readonly result: RunResult;
  readonly reply: ReplyCheck<T>;
}

const native = (session: ChancellorSession): boolean => session.choice.structured_output === 'native';

const issuesOf =
  <T>(check: Asking<T>['check']) =>
  (value: unknown): readonly string[] => {
    const checked = check(value);
    return checked.ok ? [] : checked.issues;
  };

function requestOf<T>(session: ChancellorSession, asking: Asking<T>) {
  const { character } = session.choice;
  return {
    role: 'chancellor',
    character,
    cwd: session.run_dir,
    prompt: asking.prompt,
    permissions: toolPolicyOf({ role: 'chancellor', characterClass: session.characterClass, character }),
    budget: { max_turns: CHANCELLOR_MAX_TURNS, max_minutes: CHANCELLOR_MAX_MINUTES },
    structured: asking.schema,
    env: session.env,
    run_dir: session.run_dir,
  } satisfies SpawnRequest;
}

/** The CLI's own flag, or the schema in the prompt with one retry for a reply that cannot be used (a fresh session). */
async function spawned<T>(session: ChancellorSession, asking: Asking<T>): Promise<RunningSession> {
  const request = requestOf(session, asking);
  if (native(session)) return session.runner.spawn(request);
  return spawnParsed(session.runner, request, { check: issuesOf(asking.check), resume: false });
}

/** The structured output, or the last text where the schema was in the prompt; undefined when there is none. */
function replyOf<T>(
  session: ChancellorSession,
  asking: Asking<T>,
  structured: unknown,
  text: string | undefined,
): ReplyCheck<T> | undefined {
  if (native(session)) return structured === undefined ? undefined : asking.check(structured);
  return text === undefined ? undefined : checkTextReply(text, asking.check);
}

/** Its last text and its result; killed, with any retry, when it outlasts the timeout or the signal aborts. */
export async function hear<T>(
  session: ChancellorSession,
  asking: Asking<T>,
): Promise<Result<Heard<T>, ChancellorFailure>> {
  await mkdir(session.run_dir, { recursive: true });
  const running = await spawned(session, asking);
  // Written by the signal reader, the timer and the caller's signal while wait() runs.
  const seen: { text?: string; late: boolean; stopped: boolean } = { late: false, stopped: false };
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
  const stop = () => {
    seen.stopped = true;
    void running.kill('the Steward stopped');
  };
  if (asking.signal?.aborted === true) stop();
  asking.signal?.addEventListener('abort', stop);
  const result = await running.wait();
  clearTimeout(timer);
  asking.signal?.removeEventListener('abort', stop);
  await reading;
  if (seen.stopped) return err({ code: 'stopped' });
  if (result.rate_limited) return err({ code: 'rate_limited' });
  if (seen.late) return err({ code: 'timed_out' });
  const reply = replyOf(session, asking, result.structured, seen.text);
  if (reply === undefined) return err({ code: 'no_reply', outcome: result.outcome });
  return ok({ result, reply });
}

/** The ids of the session and of its retry, when there was one: the owner may look both up. */
export const sessionIdsOf = (result: RunResult): string[] => [
  result.session_id,
  ...(result.sequels ?? []).map(({ session_id }) => session_id),
];
