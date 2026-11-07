// Claude Code's stream-json, line by line (implementation-plan §3.7, §3.10, §3.12; spike P1-02, fixtures/). The
// reader keeps what the result needs (session, last `result`, usage so far) and names what the runner acts on:
// signals for the Steward, lines only the stream knows (apprentice start and end, API retries).
import { isObject, modelUsageTokens, numberOf, objectOf, objectsOf, textOf, usageTokens } from './json.ts';
import { rejectionOf } from './usage.ts';
import type { JsonObject } from './json.ts';

export type Observation =
  | { readonly kind: 'init'; readonly session: string }
  | { readonly kind: 'text'; readonly text: string }
  /** Tokens so far: never goes down within a session. */
  | { readonly kind: 'usage'; readonly tokens: number }
  | { readonly kind: 'tool_blocked'; readonly tool: string; readonly reason: string }
  /** `system/api_retry`; with `error: rate_limit` the account is running out (cli-facts §1.2). */
  | { readonly kind: 'api_retry'; readonly error: string; readonly detail: string }
  | { readonly kind: 'rate_limit'; readonly detail: string; readonly resets_at?: string }
  | { readonly kind: 'subagent_start'; readonly agent_type: string }
  | { readonly kind: 'subagent_end'; readonly agent_type: string; readonly duration_ms: number };

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
  readonly messages: Map<string, number>;
  /** Apprentice runs in progress → their type and last known duration. */
  readonly runs: Map<string, { readonly agent_type: string; duration_ms: number }>;
}

const TOO_MANY_REQUESTS = 429;

function grow(state: State, next: number): Observation[] {
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
  return [
    ...observed,
    ...grow(
      state,
      [...state.messages.values()].reduce((sum, value) => sum + value, 0),
    ),
  ];
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
  return [{ kind: 'subagent_end', agent_type: run.agent_type, duration_ms: Math.round(run.duration_ms) }];
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

function limit(state: State, line: JsonObject): Observation[] {
  const rejected = rejectionOf(objectOf(line, 'rate_limit_info'));
  if (rejected === undefined) return [];
  state.rateLimited = true;
  return [{ kind: 'rate_limit', ...rejected }];
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
