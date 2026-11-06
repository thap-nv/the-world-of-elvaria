// The twelve Claude Code hook events Elvaria registers (cli-facts §1.4), each turned into at most a few lines
// of the event log (implementation-plan §3.6, §3.10). Lines go to the log and the quest's journal (write.ts).
import { notification, translation, withoutUndefined } from '../draft.ts';
import { recordHandoverStart, stopGate } from '../handover.ts';
import { recordSubagentStart, subagentDuration } from '../subagents.ts';
import { claudeInputOf } from './input.ts';
import { postToolUse, postToolUseFailure, preToolUse } from './tool-events.ts';
import type { HookContext } from '../context.ts';
import type { Translation } from '../draft.ts';
import type { ClaudeInput } from './input.ts';

type Handler = (input: ClaudeInput, ctx: HookContext, now: number) => Translation;

/** What a required id-like field reads when the CLI left it out; the line stays valid and says so. */
const UNKNOWN = 'unknown';

/** `agent.session.start.model` takes a model slug: `claude-sonnet-4-5[1m]` keeps `claude-sonnet-4-5`. */
export const modelSlugOf = (model: string | undefined): string =>
  /^[a-z0-9][a-z0-9.-]*/.exec(model?.toLowerCase() ?? '')?.[0] ?? UNKNOWN;

/** `mana.signal.error` is a snake_case id (`rate_limit`, `billing_error`). */
export const snakeIdOf = (value: string | undefined): string => {
  const id = (value ?? '').toLowerCase().replace(/[^a-z0-9_]+/g, '_');
  return /^[a-z]/.test(id) ? id : UNKNOWN;
};

function sessionStart(input: ClaudeInput, ctx: HookContext): Translation {
  const data = { session: input.session ?? UNKNOWN, model: modelSlugOf(input.text('model')) };
  return translation([{ type: 'agent.session.start', data }], { problems: recordHandoverStart(ctx) });
}

/** A turn that ended on an API error. The Steward decides which errors mean "out of mana" (§3.5). */
const stopFailure: Handler = (input) =>
  translation([
    { type: 'mana.signal', data: { error: snakeIdOf(input.text('error')), source: 'stop_failure' } },
  ]);

const subagentStart: Handler = (input, ctx, now) => {
  const agentType = input.text('agent_type') ?? UNKNOWN;
  const problems = recordSubagentStart(ctx.runDir, input.text('agent_id') ?? '', now);
  return translation([{ type: 'agent.subagent.start', data: { agent_type: agentType } }], { problems });
};

const subagentStop: Handler = (input, ctx, now) => {
  const data = {
    agent_type: input.text('agent_type') ?? UNKNOWN,
    duration_ms: subagentDuration(ctx.runDir, input.text('agent_id') ?? '', now),
  };
  return translation([{ type: 'agent.subagent.end', data }]);
};

/** Meditation (§3.12): the summary itself stays out, like transcripts (ADR 0010). */
const compact =
  (phase: 'pre' | 'post'): Handler =>
  (input) =>
    translation([
      { type: 'agent.compact', data: withoutUndefined({ phase, trigger: input.text('trigger') }) },
    ]);

const notice: Handler = (input) => {
  const draft = notification(input.text('notification_type') ?? UNKNOWN, input.text('message') ?? '');
  const title = input.text('title');
  return translation([title === undefined ? draft : { ...draft, data: { ...draft.data, title } }]);
};

const HANDLERS = new Map<string, Handler>([
  ['SessionStart', sessionStart],
  // agent.session.end comes from the stream's `result` (runner, P1-09): only it knows outcome and usage.
  ['SessionEnd', () => translation([])],
  ['PreToolUse', preToolUse],
  ['PostToolUse', postToolUse],
  ['PostToolUseFailure', postToolUseFailure],
  ['Stop', (input, ctx) => stopGate(ctx, input.session ?? UNKNOWN)],
  ['StopFailure', stopFailure],
  ['SubagentStart', subagentStart],
  ['SubagentStop', subagentStop],
  ['PreCompact', compact('pre')],
  ['PostCompact', compact('post')],
  ['Notification', notice],
]);

/** The events this hook handles, in the order of cli-facts §1.4. */
export const CLAUDE_HOOK_EVENTS: readonly string[] = [...HANDLERS.keys()];

/** One Claude Code hook call. Events Elvaria does not register write nothing. */
export function translateClaude(
  raw: Readonly<Record<string, unknown>>,
  ctx: HookContext,
  now: number,
): Translation {
  const input = claudeInputOf(raw);
  return HANDLERS.get(input.event)?.(input, ctx, now) ?? translation([]);
}
