// A structured reply from a tribe whose CLI has no JSON Schema flag (implementation-plan §3.14 `structured_output:
// prompt_and_parse`, ADR 0021; P1-33): the schema goes into the system part, the JSON is cut out of the last text,
// and a reply the caller's check cannot use is tried once more in `<run_dir>/retry/`, told what was wrong. The retry
// continues the first session when the tribe can resume, so the model need not read the diff again; otherwise it is
// a fresh session with the whole prompt. The Chancellor's drafts and the judge's verdict take this road alike.
import path from 'node:path';

import { NO_JSON, RETRY_DIR, jsonOfText, replyFormatBlock, retryBlock } from './reply.ts';
import { spawnSequel } from './sequel.ts';
import type { Follow, Heard } from './sequel.ts';
import type { AgentRunner, JsonSchema, RunResult, RunningSession, SpawnRequest } from '../runner/types.ts';

export interface ParseOptions {
  /** What is wrong with a reply, [] when the caller can use it: its own check (zod, and what JSON Schema cannot say). */
  readonly check: (value: unknown) => readonly string[];
  /** The tribe can continue a session (`capabilities.resume`): the retry goes on from the first. */
  readonly resume: boolean;
  /** The retry's process runs now (Sequel.spawned): the Steward records its pid. */
  readonly spawned?: () => void;
}

/** The request without the schema flag, the schema named in the system part instead. */
export function parsedRequest(request: SpawnRequest, schema: JsonSchema): SpawnRequest {
  const { structured: _, ...plain } = request;
  const system = `${request.prompt.system}\n\n${replyFormatBlock(schema)}`;
  return { ...plain, prompt: { ...request.prompt, system } };
}

/** What is wrong with the reply in a session's last text; none when the caller can use it. */
export function replyIssues(text: string | undefined, check: ParseOptions['check']): readonly string[] {
  const value = jsonOfText(text);
  return value === undefined ? [NO_JSON] : check(value);
}

/**
 * The retry: told what was wrong, in a folder of its own. Resumed, it is told only that, since the first session
 * still holds the rest; fresh, it gets the whole prompt again with the issues after it.
 */
export function retryRequest(heard: Heard, issues: readonly string[], resume: boolean): SpawnRequest {
  const { request, result } = heard;
  const run_dir = path.join(request.run_dir, RETRY_DIR);
  const told = retryBlock(issues);
  if (resume && result.session_id !== '')
    return {
      ...request,
      run_dir,
      resume: { session_id: result.session_id },
      prompt: { ...request.prompt, user: told },
    };
  const { resume: _, ...fresh } = request;
  return { ...fresh, run_dir, prompt: { ...request.prompt, user: `${request.prompt.user}\n\n${told}` } };
}

/** Only a session that ended of itself, not at a usage limit, has a reply worth trying again. */
const mayRetry = (result: RunResult): boolean => result.outcome === 'completed' && !result.rate_limited;

/** The run's structured output: the JSON of the last text, whatever the caller makes of it; none without one. */
function withReply(result: RunResult, heard: readonly Heard[]): RunResult {
  const { structured: _, ...rest } = result;
  const value = jsonOfText(heard.at(-1)?.text);
  return value === undefined ? rest : { ...rest, structured: value };
}

/**
 * Spawns `request` for a reply that `request.structured` describes, on a runner that cannot enforce it: one
 * RunningSession, its result's `structured` the JSON of the last text, `sequels` the retry when there was one.
 */
export function spawnParsed(
  runner: AgentRunner,
  request: SpawnRequest & { readonly structured: JsonSchema },
  options: ParseOptions,
): Promise<RunningSession> {
  const next = (heard: Heard, round: number): Follow | undefined => {
    if (round > 0 || !mayRetry(heard.result)) return undefined;
    const issues = replyIssues(heard.text, options.check);
    if (issues.length === 0) return undefined;
    return { request: retryRequest(heard, issues, options.resume), why: issues.join('; ') };
  };
  const { spawned } = options;
  return spawnSequel(runner, parsedRequest(request, request.structured), {
    next,
    finish: withReply,
    ...(spawned === undefined ? {} : { spawned }),
  });
}
