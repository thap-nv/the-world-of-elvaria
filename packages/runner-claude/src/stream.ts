// Claude Code's stream-json, line by line (implementation-plan §3.7, §3.10, §3.12; spike P1-02, fixtures/). The
// reader keeps what the result needs (session, last `result`, usage so far) and names what the runner acts on:
// signals for the Steward, lines only the stream knows (apprentice start and end, API retries).
import { countedTokens } from '@elvaria/runner-core';
import type { SessionTokens } from '@elvaria/runner-core';

import {
  addTokens,
  isObject,
  modelUsageTokens,
  numberOf,
  objectOf,
  objectsOf,
  textOf,
  usageTokens,
} from './json.ts';
import { rateLimitWindowsOf, rejectionOf, spentWindowOf } from './usage.ts';
import type { JsonObject } from './json.ts';
import type { UsageWindow } from './usage.ts';

export type Observation =
  | { readonly kind: 'init'; readonly session: string }
  | { readonly kind: 'text'; readonly text: string }
  /** Tokens so far, cache reads at a tenth (`countedTokens`, P1-23): never goes down within a session. */
  | { readonly kind: 'usage'; readonly tokens: number }
  | { readonly kind: 'tool_blocked'; readonly tool: string; readonly reason: string }
  /** `system/api_retry`; with `error: rate_limit` the account is running out (cli-facts §1.2). */
  | { readonly kind: 'api_retry'; readonly error: string; readonly detail: string }
  | { readonly kind: 'rate_limit'; readonly detail: string; readonly resets_at?: string }
  /** The account's windows of a `rate_limit_event`, for the mana gauge (P1-05). */
  | { readonly kind: 'mana'; readonly windows: readonly UsageWindow[] }
  | { readonly kind: 'subagent_start'; readonly agent_type: string }
  | {
      readonly kind: 'subagent_end';
      readonly agent_type: string;
      readonly duration_ms: number;
      /** The CLI cut the run at its maxTurns (`agent.subagent.end.stopped`). */
      readonly stopped?: 'max_turns';
    };

export interface StreamReader {
  read(line: JsonObject): readonly Observation[];
  /** The session of the first `system/init`. */
  readonly session: string | undefined;
  /** The last `result`: background apprentices make one process print several (spike P1-02). */
  readonly result: JsonObject | undefined;
  readonly tokens: number;
  /** A rate limit was seen: an `api_retry` for it, a rejected `rate_limit_event`, or a 429 result. */
  readonly rateLimited: boolean;
}

interface State {
  session: string | undefined;
  result: JsonObject | undefined;
  tokens: number;
  rateLimited: boolean;
  /** tool_use id → tool name, to name a refused tool. */
  readonly toolNames: Map<string, string>;
  /** assistant message id → its tokens; one message spans several lines. */
  readonly messages: Map<string, SessionTokens>;
  /** Apprentice runs in progress → their type and last known duration. */
  readonly runs: Map<string, { readonly agent_type: string; duration_ms: number }>;
}

const TOO_MANY_REQUESTS = 429;

/** Both parts are summed before counting, so rounding happens once per total, not once per message. */
function grow(state: State, parts: SessionTokens): Observation[] {
  const next = countedTokens(parts);
  if (next <= state.tokens) return [];
  state.tokens = next;
  return [{ kind: 'usage', tokens: next }];
}

/** The text of a tool_result's content: a string, or the text blocks of a list. */
function contentText(block: JsonObject): string {
  const content = block.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(isObject)
    .map((part) => textOf(part, 'text') ?? '')
    .join('\n');
}

function assistant(state: State, line: JsonObject): Observation[] {
  const message = objectOf(line, 'message');
  const id = textOf(message, 'id');
  if (id !== undefined) state.messages.set(id, usageTokens(objectOf(message, 'usage')));
  // Only the character's own words; an apprentice's lines carry the Agent call that started it.
  const own = (line.parent_tool_use_id ?? null) === null;
  const observed: Observation[] = [];
  for (const block of objectsOf(message, 'content')) {
    const type = textOf(block, 'type');
    const toolId = textOf(block, 'id');
    const text = textOf(block, 'text');
    if (type === 'tool_use' && toolId !== undefined)
      state.toolNames.set(toolId, textOf(block, 'name') ?? 'unknown');
    if (type === 'text' && text !== undefined && own) observed.push({ kind: 'text', text });
  }
  return [...observed, ...grow(state, addTokens([...state.messages.values()]))];
}

/** A tool the CLI refused, by rule, by mode or by a hook: `tool_result_meta[].permission_decision`. */
function user(state: State, line: JsonObject): Observation[] {
  const refused = new Set(
    objectsOf(line, 'tool_result_meta')
      .filter((meta) => textOf(objectOf(meta, 'permission_decision'), 'decision') === 'reject')
      .map((meta) => textOf(meta, 'id')),
  );
  return objectsOf(objectOf(line, 'message'), 'content')
    .filter((block) => textOf(block, 'type') === 'tool_result' && refused.has(textOf(block, 'tool_use_id')))
    .map((block) => ({
      kind: 'tool_blocked' as const,
      tool: state.toolNames.get(textOf(block, 'tool_use_id') ?? '') ?? 'unknown',
      reason: contentText(block) || 'refused',
    }));
}

/** The CLI's lines about a sub-agent run (its words, allowed in scripts/docs-identifiers.mjs). */
const SUBAGENT_LINES: ReadonlySet<string> = new Set([
  'task_started',
  'task_progress',
  'task_updated',
  'task_notification',
]);

/**
 * How Claude Code 2.1.318 says it stopped a sub-agent at its maxTurns: the notification's summary starts "NOTE: this
 * agent stopped at its 2-turn limit before finishing." (fixtures/apprentice-max-turns.jsonl). No field says it, so the
 * words do; a CLI that words it otherwise leaves `stopped` out, and nothing else depends on it.
 */
const CUT_AT_MAX_TURNS = /stopped at its \d+-turn limit/;

/** Each stream run of a sub-agent: a revived apprentice keeps its CLI id and gets a new run id. */
const runKey = (line: JsonObject): string =>
  `${textOf(line, 'task_id') ?? ''}:${textOf(line, 'run_id') ?? ''}`;

/**
 * Apprentice minutes come from the stream's sub-agent lines: SubagentStop does not run when an apprentice stops
 * at maxTurns (spike P1-02, §3.12). A run without `subagent_type` (a background shell) is no apprentice.
 */
function subagentRun(state: State, line: JsonObject, subtype: string): Observation[] {
  const key = runKey(line);
  const agentType = textOf(line, 'subagent_type');
  if (subtype === 'task_started' && agentType !== undefined) {
    state.runs.set(key, { agent_type: agentType, duration_ms: 0 });
    return [{ kind: 'subagent_start', agent_type: agentType }];
  }
  const run = state.runs.get(key);
  if (run === undefined) return [];
  run.duration_ms = numberOf(objectOf(line, 'usage'), 'duration_ms') ?? run.duration_ms;
  if (subtype !== 'task_notification') return [];
  state.runs.delete(key);
  const end = {
    kind: 'subagent_end',
    agent_type: run.agent_type,
    duration_ms: Math.round(run.duration_ms),
  } as const;
  return [CUT_AT_MAX_TURNS.test(textOf(line, 'summary') ?? '') ? { ...end, stopped: 'max_turns' } : end];
}

function system(state: State, line: JsonObject): Observation[] {
  const subtype = textOf(line, 'subtype') ?? '';
  if (subtype === 'init') {
    const id = textOf(line, 'session_id');
    if (state.session !== undefined || id === undefined) return [];
    state.session = id;
    return [{ kind: 'init', session: id }];
  }
  if (subtype === 'api_retry') {
    const error = textOf(line, 'error') ?? 'unknown';
    if (error === 'rate_limit') state.rateLimited = true;
    const status = numberOf(line, 'error_status');
    return [
      {
        kind: 'api_retry',
        error,
        detail: `API retry (${error}${status === undefined ? '' : `, ${status}`})`,
      },
    ];
  }
  return SUBAGENT_LINES.has(subtype) ? subagentRun(state, line, subtype) : [];
}

function finish(state: State, line: JsonObject): Observation[] {
  state.result = line;
  if (numberOf(line, 'api_error_status') === TOO_MANY_REQUESTS) state.rateLimited = true;
  return grow(state, modelUsageTokens(objectOf(line, 'modelUsage')));
}

/**
 * The account's windows of the line, and the one a rejection names as spent in place of its figure (P1-48): the
 * Steward then sleeps that gauge until its reset, not the whole pool until the reset of another window.
 */
function windowsOf(info: JsonObject | undefined): UsageWindow[] {
  const windows = rateLimitWindowsOf(info);
  const spent = spentWindowOf(info);
  if (spent === undefined) return windows;
  return [...windows.filter((w) => w.window !== spent.window || w.model !== spent.model), spent];
}

function limit(state: State, line: JsonObject): Observation[] {
  const info = objectOf(line, 'rate_limit_info');
  const windows = windowsOf(info);
  const read: Observation[] = windows.length === 0 ? [] : [{ kind: 'mana', windows }];
  const rejected = rejectionOf(info);
  if (rejected === undefined) return read;
  state.rateLimited = true;
  return [...read, { kind: 'rate_limit', ...rejected }];
}

const HANDLERS: Readonly<Record<string, (state: State, line: JsonObject) => Observation[]>> = {
  system,
  assistant,
  user,
  result: finish,
  rate_limit_event: limit,
};

export function createStreamReader(): StreamReader {
  const state: State = {
    session: undefined,
    result: undefined,
    tokens: 0,
    rateLimited: false,
    toolNames: new Map(),
    messages: new Map(),
    runs: new Map(),
  };
  return {
    read: (line) => HANDLERS[textOf(line, 'type') ?? '']?.(state, line) ?? [],
    get session() {
      return state.session;
    },
    get result() {
      return state.result;
    },
    get tokens() {
      return state.tokens;
    },
    get rateLimited() {
      return state.rateLimited;
    },
  };
}
