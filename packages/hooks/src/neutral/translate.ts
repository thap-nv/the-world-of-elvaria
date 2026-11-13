// A hook call of a CLI read through the neutral dialect (implementation-plan §3.6, PS-23): the adapter's `dialect` in
// policy.json says where the event, the session, the model and the tool call are in the payload and how an answer is
// written; the rules are the same as for the three CLIs the hook knows by name (the laws, the class's tools, the
// apprentice rule as agy and Codex keep it: no sub-agent at all, the handover letter's Stop gate).
import { classViolation, missingTools } from '../class-gate.ts';
import { lawViolation, protectedViolation, refusalText } from '../claude/tool-events.ts';
import { plotPath } from '../claude/tools.ts';
import { modelSlugOf } from '../claude/translate.ts';
import { patchPathsOf } from '../codex/tools.ts';
import { translation, withoutUndefined } from '../draft.ts';
import { graphLineViolation } from '../graph.ts';
import { recordHandoverStart, stopGate } from '../handover.ts';
import { grepOptionViolation } from '../search.ts';
import { answerOf, dialectToolOf, textAt, valueAt } from './dialect.ts';
import type { ToolCall } from '../claude/tools.ts';
import type { HookContext } from '../context.ts';
import type { Translation } from '../draft.ts';
import type { DialectTool, HookDialect } from './dialect.ts';

const UNKNOWN = 'unknown';
const REFUSALS: Readonly<Record<NonNullable<DialectTool['refuse']>, string>> = {
  subagent: 'sub-agents are not allowed for this tribe; do the work yourself',
  ask: 'nobody answers inside this session; write your question in the Question section of the handover letter and end the session',
  tool: 'no class of Elvaria has this tool; do the work with the tools you have',
};
const UNDECLARED =
  "this tool is not one your tribe's adapter declared to Elvaria, so its files and commands cannot be checked; do the work with another tool";

/** One call as the dialect reads it. */
interface NeutralInput {
  readonly raw: Readonly<Record<string, unknown>>;
  readonly dialect: HookDialect;
  readonly name: string;
  readonly tool: DialectTool | undefined;
}

const texts = (value: unknown): string[] => {
  if (typeof value === 'string') return value === '' ? [] : [value];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item !== '')
    : [];
};

/** The call in the shape every branch of the hook judges; an undeclared tool is `other` and names nothing. */
function callOf({ raw, dialect, tool }: NeutralInput): ToolCall {
  const input = valueAt(raw, dialect.tool_input);
  const at = (key: string | undefined) => (key === undefined ? undefined : valueAt(input, key));
  const paths = [
    ...(tool?.paths ?? []).flatMap((key) => texts(at(key))),
    ...patchPathsOf(texts(at(tool?.patch))[0]),
  ];
  return {
    kind: tool?.kind ?? 'other',
    paths,
    guarded: paths,
    command: texts(at(tool?.command))[0],
    url: texts(at(tool?.url))[0],
    subagent: tool?.refuse === 'subagent' ? 'subagent' : undefined,
    model: undefined,
  };
}

/** Why an Elvaria rule (not a territory law) stops this call, if one does. */
function ruleViolation(input: NeutralInput, call: ToolCall, ctx: HookContext): string | undefined {
  const { name, tool } = input;
  if (tool === undefined)
    return input.dialect.unknown_tools === 'allow' ? undefined : `${name}: ${UNDECLARED}`;
  if (tool.refuse !== undefined) return `${name}: ${REFUSALS[tool.refuse]}`;
  // Whatever the class: `git grep -O<pager>` runs a program (P1-53), and no graphify line but the quest's own (PS-21).
  const option = call.command === undefined ? undefined : grepOptionViolation(call.command);
  if (option !== undefined) return `${name}: ${option}`;
  const graph = call.command === undefined ? undefined : graphLineViolation(call.command, ctx.graphCommands);
  if (graph !== undefined) return `${name}: ${graph}`;
  const missing = missingTools(tool.grants, ctx.tools);
  return missing === undefined ? undefined : classViolation(name, missing, call, ctx);
}

function preTool(input: NeutralInput, ctx: HookContext): Translation {
  const call = callOf(input);
  const rule = ruleViolation(input, call, ctx) ?? protectedViolation(call, ctx.laws);
  const reason = rule ?? lawViolation(call, ctx.laws);
  const { answers } = input.dialect;
  if (reason === undefined) return translation([], { decision: answers.pass });
  const source = rule === undefined ? 'law of this territory' : 'rule';
  return translation([{ type: 'agent.tool.blocked', data: { tool: call.kind, reason } }], {
    decision: answerOf(answers.deny, refusalText(source, reason)),
  });
}

function postTool(input: NeutralInput): Translation {
  const call = callOf(input);
  const path = call.paths[0];
  const exit = valueAt(input.raw, input.dialect.exit);
  const data = withoutUndefined({
    tool: call.kind,
    path: path === undefined ? undefined : plotPath(path, textAt(input.raw, input.dialect.cwd)),
    command: call.command,
    url: call.url,
    exit: Number.isInteger(exit) ? exit : undefined,
  });
  return translation([{ type: 'agent.tool', data }]);
}

function sessionStart(input: NeutralInput, ctx: HookContext): Translation {
  const session = textAt(input.raw, input.dialect.session) ?? UNKNOWN;
  const data = { session, model: modelSlugOf(textAt(input.raw, input.dialect.model) ?? ctx.model) };
  return translation([{ type: 'agent.session.start', data }], { problems: recordHandoverStart(ctx) });
}

/** The handover gate of ADR 0010, answered as the dialect's `stop`; a CLI without one is not held. */
function stop(input: NeutralInput, ctx: HookContext): Translation {
  const gate = stopGate(ctx, textAt(input.raw, input.dialect.session) ?? UNKNOWN);
  const reason = gate.decision?.reason;
  const template = input.dialect.answers.stop;
  if (typeof reason !== 'string' || template === undefined) return { ...gate, decision: undefined };
  return { ...gate, decision: answerOf(template, reason) };
}

type Handler = (input: NeutralInput, ctx: HookContext) => Translation;

/** The CLI's names of the four events, each to its handler; an event the dialect does not name writes nothing. */
function handlersOf(dialect: HookDialect): Map<string, Handler> {
  const { events } = dialect;
  const pairs: [string | undefined, Handler][] = [
    [events.session_start, sessionStart],
    [events.pre_tool, preTool],
    [events.post_tool, postTool],
    [events.stop, stop],
  ];
  return new Map(pairs.filter((pair): pair is [string, Handler] => pair[0] !== undefined));
}

/** One hook call of a CLI the adapter describes with `dialect`; `event` is the CLI's own name of it. */
export function translateNeutral(
  raw: Readonly<Record<string, unknown>>,
  event: string,
  dialect: HookDialect,
  ctx: HookContext,
): Translation {
  const name = textAt(raw, dialect.tool_name) ?? '';
  const input = { raw, dialect, name, tool: dialectToolOf(dialect, name) };
  return handlersOf(dialect).get(event)?.(input, ctx) ?? translation([]);
}

/** The deny of an unreadable call, written as the dialect's deny (run-hook.ts fails closed, P1-36). */
export const neutralDeny = (dialect: HookDialect, reason: string): Record<string, unknown> => ({
  ...answerOf(dialect.answers.deny, reason),
});
