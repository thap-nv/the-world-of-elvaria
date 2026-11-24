// agy's stream-json (spike P1-12a §5): `init` names the session, `step_update` lines carry text, token usage and
// tool results, `result` ends the run. Steps of a sub-agent's conversation are not this session's.
import { countedTokens, numberOf, objectOf, objectsOf, streamReaderOf, textOf } from '@elvaria/runner-core';
import type {
  JsonObject,
  PermissionDenial,
  RunnerSignal,
  StreamReader as CoreReader,
} from '@elvaria/runner-core';

export interface AgyResult {
  readonly status: string;
  readonly response: string;
  readonly structured_output?: unknown;
  /** Tools soft-denied for want of an allow rule: such a run ends at once (spike §1 #12). */
  readonly denied_actions: readonly { readonly action: string; readonly display_name: string }[];
  readonly finished_reason?: string;
  readonly error?: string;
}

export interface StreamState {
  readonly session: string | undefined;
  /** Tokens of this run: the sum of its own steps, cache reads at a tenth (`countedTokens`, P1-22; agy's
   * `total_tokens` leaves them out). `result.usage` adds up the whole conversation, earlier runs of a resumed one
   * included (stream-resume-second.jsonl), so it is the fallback only. */
  readonly tokens: number;
  /** Model turns: DONE `agent_response` steps (spike §1 #20; `num_turns` counts user turns). */
  readonly turns: number;
  /** Model turns begun: one more than `turns` while a response streams. Past `max_turns`, the run is over budget. */
  readonly started: number;
  readonly denials: readonly PermissionDenial[];
  readonly result: AgyResult | undefined;
}

export type StreamReader = CoreReader<StreamState>;

const numberAt = (value: JsonObject | undefined, key: string): number => numberOf(value, key) ?? 0;

/** A tool error that is a refusal: by the Elvaria hook, by a deny rule, or by the missing allow rule. */
const REFUSED = /denied by pre-tool hook|permission check failed|permission denied/i;
const DETAIL_KEYS = ['CommandLine', 'Path', 'AbsolutePath', 'TargetFile', 'Url', 'Role'];

function detailOf(parameters: JsonObject): string {
  const key = DETAIL_KEYS.find((name) => typeof parameters[name] === 'string');
  return key === undefined ? JSON.stringify(parameters).slice(0, 200) : String(parameters[key]);
}

function resultOf(raw: JsonObject): AgyResult {
  const denied = objectsOf(raw, 'denied_actions').map((action) => ({
    action: textOf(action, 'action') ?? '',
    display_name: textOf(action, 'display_name') ?? 'unknown',
  }));
  const finished = textOf(raw, 'finished_reason');
  const error = textOf(raw, 'error');
  return {
    status: textOf(raw, 'status') ?? '',
    response: textOf(raw, 'response') ?? '',
    ...('structured_output' in raw ? { structured_output: raw.structured_output } : {}),
    denied_actions: denied,
    ...(finished === undefined ? {} : { finished_reason: finished }),
    ...(error === undefined ? {} : { error }),
  };
}

/** What the reader has seen so far; one per session. */
interface Tally {
  session: string | undefined;
  /** The run's own steps: `total_tokens` (input, output, thinking) and `cache_read_tokens` apart. */
  readonly parts: { tokens: number; cache_read: number };
  tokens: number;
  turns: number;
  started: number;
  result: AgyResult | undefined;
  result_tokens: number;
  readonly denials: PermissionDenial[];
  /** Text deltas of the agent_response steps still open, by step index. */
  readonly texts: Map<number, string>;
}

/** A refused tool: the Steward hears it, and RunResult lists it. */
function refuse(tally: Tally, tool: string, detail: string, reason: string): RunnerSignal[] {
  tally.denials.push({ tool, detail });
  return [{ kind: 'tool_blocked', tool, reason }];
}

function response(tally: Tally, step: JsonObject, index: number): RunnerSignal[] {
  // The first line of a step begins a turn; its text stays open in `texts` until its DONE line.
  if (!tally.texts.has(index)) tally.started += 1;
  tally.texts.set(index, (tally.texts.get(index) ?? '') + (textOf(step, 'text_delta') ?? ''));
  if (textOf(step, 'state') !== 'DONE') return [];
  const text = tally.texts.get(index)?.trim() ?? '';
  tally.texts.delete(index);
  tally.turns += 1;
  const usage = objectOf(step, 'usage');
  tally.parts.tokens += numberAt(usage, 'total_tokens');
  tally.parts.cache_read += numberAt(usage, 'cache_read_tokens');
  tally.tokens = countedTokens(tally.parts);
  return [...(text === '' ? [] : [{ kind: 'text', text } as const]), { kind: 'usage', tokens: tally.tokens }];
}

function step(tally: Tally, raw: JsonObject): RunnerSignal[] {
  if (tally.session !== undefined && textOf(raw, 'conversation_id') !== tally.session) return [];
  const type = textOf(raw, 'step_type');
  const errored = textOf(raw, 'state') === 'ERROR';
  if (type === 'agent_response') return response(tally, raw, numberAt(raw, 'step_index'));
  const tool = textOf(raw, 'tool_name') ?? type ?? 'unknown';
  const info = objectOf(raw, 'tool_info');
  if (type === 'tool' && errored) {
    const message = textOf(objectOf(info, 'error'), 'message') ?? '';
    return REFUSED.test(message)
      ? refuse(tally, tool, detailOf(objectOf(info, 'parameters') ?? {}), message)
      : [];
  }
  // A sub-agent the hook denied ends as an ERROR step with no sub-agent and no message (spike M10a).
  if (type === 'subagent' && errored) return refuse(tally, tool, tool, 'sub-agent refused');
  return [];
}

function result(tally: Tally, raw: JsonObject): RunnerSignal[] {
  tally.result = resultOf(raw);
  const id = textOf(raw, 'conversation_id');
  if (id !== '') tally.session ??= id;
  const usage = objectOf(raw, 'usage');
  tally.result_tokens = countedTokens({
    tokens: numberAt(usage, 'total_tokens'),
    cache_read: numberAt(usage, 'cache_read_tokens'),
  });
  return tally.result.denied_actions.flatMap((denied) =>
    refuse(tally, denied.display_name, denied.action, 'soft-denied: no allow rule, and the run ended'),
  );
}

/** One line of agy's stream: `init` names the session, `step_update` and `result` carry the rest. */
function lineOf(tally: Tally, value: JsonObject): RunnerSignal[] {
  if (value.event === 'init') tally.session ??= textOf(value, 'conversation_id');
  if (value.event === 'step_update') return step(tally, objectOf(value, 'step_update') ?? {});
  return value.event === 'result' ? result(tally, objectOf(value, 'result') ?? {}) : [];
}

function stateOf(tally: Tally): StreamState {
  const { session, tokens, turns, started, denials } = tally;
  return {
    session,
    tokens: tokens > 0 ? tokens : tally.result_tokens,
    turns,
    started,
    denials,
    result: tally.result,
  };
}

export function createStreamReader(): StreamReader {
  const tally: Tally = {
    session: undefined,
    parts: { tokens: 0, cache_read: 0 },
    tokens: 0,
    turns: 0,
    started: 0,
    result: undefined,
    result_tokens: 0,
    denials: [],
    texts: new Map(),
  };
  return streamReaderOf(tally, lineOf, stateOf);
}
