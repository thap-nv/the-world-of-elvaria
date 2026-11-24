// Codex's `exec --json` stream (spike Codex 2026-11-12 §1.5): `thread.started` names the session, `item.*` lines
// carry messages and tool calls, `turn.completed` the usage of the turn, `turn.failed` and `error` what went wrong.
// Codex counts no turns of its own and has no turn cap, so the reader counts the model's actions (each message and
// each tool call), which the session holds to `budget.max_turns` as agy's runner does.
import { countedTokens, numberOf, objectOf, streamReaderOf, textOf } from '@elvaria/runner-core';
import type { JsonObject, RunnerSignal, StreamReader as CoreReader } from '@elvaria/runner-core';

export interface CodexState {
  readonly session: string | undefined;
  /** Tokens of the run as `countedTokens` counts them: cache reads at a tenth (P1-23). */
  readonly tokens: number;
  /** Actions of the model that ended: messages and tool calls. */
  readonly turns: number;
  /** Actions begun: one more than `turns` while a tool call runs. */
  readonly started: number;
  /** A `turn.completed` came: the turn ended on its own. */
  readonly completed: boolean;
  /** `turn.failed`'s message, if the turn failed. */
  readonly failure: string | undefined;
  /** The last `error` line: a retry note, or the cause of a failure. */
  readonly last_error: string | undefined;
  /** The agent's messages in order; the last is its answer. */
  readonly messages: readonly string[];
}

export type StreamReader = CoreReader<CodexState>;

/** Items that are an action of the model besides its messages (spike §1.5); reasoning and notes are not. */
const ACTIONS: ReadonlySet<string> = new Set([
  'command_execution',
  'file_change',
  'mcp_tool_call',
  'web_search',
  'collab_tool_call',
]);

const numberAt = (value: JsonObject | undefined, key: string): number => numberOf(value, key) ?? 0;

interface Tally {
  session: string | undefined;
  readonly parts: { tokens: number; cache_read: number };
  turns: number;
  started: number;
  completed: boolean;
  failure: string | undefined;
  last_error: string | undefined;
  readonly messages: string[];
  /** Ids of the action items begun and not yet ended. */
  readonly open: Set<string>;
}

function itemStarted(tally: Tally, item: JsonObject | undefined): RunnerSignal[] {
  const id = textOf(item, 'id') ?? '';
  if (ACTIONS.has(textOf(item, 'type') ?? '') && !tally.open.has(id)) {
    tally.open.add(id);
    tally.started += 1;
  }
  return [];
}

function itemCompleted(tally: Tally, item: JsonObject | undefined): RunnerSignal[] {
  const type = textOf(item, 'type') ?? '';
  if (type === 'agent_message') {
    const text = (textOf(item, 'text') ?? '').trim();
    tally.started += 1;
    tally.turns += 1;
    tally.messages.push(text);
    return text === '' ? [] : [{ kind: 'text', text }];
  }
  if (!ACTIONS.has(type)) return [];
  // A file change has no started line (spike §1.5): it begins and ends here.
  if (!tally.open.delete(textOf(item, 'id') ?? '')) tally.started += 1;
  tally.turns += 1;
  return [];
}

/** Codex's `input_tokens` holds the cached part: full price for the rest and the output, a tenth for the cache. */
function turnCompleted(tally: Tally, usage: JsonObject | undefined): RunnerSignal[] {
  tally.completed = true;
  const input = numberAt(usage, 'input_tokens');
  const cached = numberAt(usage, 'cached_input_tokens');
  tally.parts.tokens += Math.max(0, input - cached) + numberAt(usage, 'output_tokens');
  tally.parts.cache_read += cached;
  return [{ kind: 'usage', tokens: countedTokens(tally.parts) }];
}

/**
 * The failure is also told as a text, as Claude Code prints an API refusal as its text: the Steward's log and the
 * Chancellor's `cli_error` line then say what went wrong, where they only had an outcome `error` (§11 2026-11-14 (47)).
 */
function turnFailed(tally: Tally, message: string): RunnerSignal[] {
  tally.failure = message;
  return [{ kind: 'text', text: `codex turn failed: ${message}` }];
}

function lineOf(tally: Tally, value: JsonObject): RunnerSignal[] {
  switch (textOf(value, 'type')) {
    case 'thread.started':
      tally.session ??= textOf(value, 'thread_id');
      return [];
    case 'item.started':
      return itemStarted(tally, objectOf(value, 'item'));
    case 'item.completed':
      return itemCompleted(tally, objectOf(value, 'item'));
    case 'turn.completed':
      return turnCompleted(tally, objectOf(value, 'usage'));
    case 'turn.failed':
      return turnFailed(tally, textOf(objectOf(value, 'error'), 'message') ?? 'the turn failed');
    case 'error':
      tally.last_error = textOf(value, 'message') ?? tally.last_error;
      return [];
    default:
      return [];
  }
}

function stateOf(tally: Tally): CodexState {
  const { session, turns, started, completed, failure, last_error, messages } = tally;
  return {
    session,
    tokens: countedTokens(tally.parts),
    turns,
    started,
    completed,
    failure,
    last_error,
    messages,
  };
}

export function createStreamReader(): StreamReader {
  const tally: Tally = {
    session: undefined,
    parts: { tokens: 0, cache_read: 0 },
    turns: 0,
    started: 0,
    completed: false,
    failure: undefined,
    last_error: undefined,
    messages: [],
    open: new Set(),
  };
  return streamReaderOf(tally, lineOf, stateOf);
}
