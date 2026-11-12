// The four Codex CLI hook events the runner declares through `-c hooks.<Event>=…` (spike Codex 2026-11-12 §3,
// P1-12d), each turned into at most one line of the event log (implementation-plan §3.6, §3.10). Codex reads Claude
// Code's answers (`permissionDecision: "deny"`, Stop's `decision: "block"`), so only the tools are its own.
import { denyTool, translation, withoutUndefined } from '../draft.ts';
import { graphLineViolation } from '../graph.ts';
import { stopGate } from '../handover.ts';
import { grepOptionViolation, plainLineProblem, plainSearchReason, searchCommandOf } from '../search.ts';
import { lawViolation, protectedViolation, refusalText } from '../claude/tool-events.ts';
import { claudeInputOf } from '../claude/input.ts';
import { plotPath } from '../claude/tools.ts';
import { sessionStart } from '../claude/translate.ts';
import { codexToolCallOf, isAskTool, isRefusedTool, missingCodexTools } from './tools.ts';
import type { ToolCall } from '../claude/tools.ts';
import type { HookContext } from '../context.ts';
import type { Translation } from '../draft.ts';
import type { ClaudeInput } from '../claude/input.ts';

type Handler = (input: ClaudeInput, ctx: HookContext) => Translation;

const SUBAGENT_REASON = 'sub-agents are not allowed for this tribe yet; do the work yourself';
const ASK_REASON =
  'nobody answers inside this session; write your question in the Question section of the handover letter and end the session';
const REFUSED_REASON = 'no class of Elvaria has this tool; do the work with the tools you have';

/**
 * Why a class without the tools that grant `name` may not use it. A class without a shell may still run one plain
 * search command the policy grants for Glob and Grep (P1-53), since Codex has no search tool of its own.
 */
function classViolation(name: string, missing: readonly string[], call: ToolCall, ctx: HookContext) {
  const { command } = call;
  if (command !== undefined && searchCommandOf(command, ctx.searchCommands) !== undefined) {
    const problem = plainLineProblem(command);
    return problem === undefined ? undefined : `${name}: ${plainSearchReason(problem, ctx.searchCommands)}`;
  }
  const searching =
    command === undefined || ctx.searchCommands.length === 0
      ? ''
      : `; to search or read the files git tracks, run ${ctx.searchCommands.join(' or ')} alone`;
  return `${name}: your class has no ${missing.join(' or ')}${searching}; do the work with the tools you have`;
}

/** Why an Elvaria rule (not a territory law) stops this tool, if one does. */
function ruleViolation(name: string, call: ToolCall, ctx: HookContext): string | undefined {
  if (call.subagent !== undefined) return `${name}: ${SUBAGENT_REASON}`;
  if (isAskTool(name)) return `${name}: ${ASK_REASON}`;
  if (isRefusedTool(name)) return `${name}: ${REFUSED_REASON}`;
  // Whatever the class: `git grep -O<pager>` runs a program (P1-53).
  const option = call.command === undefined ? undefined : grepOptionViolation(call.command);
  if (option !== undefined) return `${name}: ${option}`;
  // Whatever the class too: no graphify call that builds, writes or names another graph (PS-21). Granting the
  // graph's commands to a Codex class without a shell is PS-23's, for every tribe.
  const graph = call.command === undefined ? undefined : graphLineViolation(call.command, ctx.graphCommands);
  if (graph !== undefined) return `${name}: ${graph}`;
  const missing = missingCodexTools(name, ctx.tools);
  return missing === undefined ? undefined : classViolation(name, missing, call, ctx);
}

const nameOf = (input: ClaudeInput): string => input.text('tool_name') ?? '';

/** A call nothing stops gets no answer: Codex runs it, inside its sandbox (spike §4). */
function preToolUse(input: ClaudeInput, ctx: HookContext): Translation {
  const call = codexToolCallOf(input.raw.tool_name, input.raw.tool_input);
  const rule = ruleViolation(nameOf(input), call, ctx) ?? protectedViolation(call, ctx.laws);
  const reason = rule ?? lawViolation(call, ctx.laws);
  if (reason === undefined) return translation([]);
  const source = rule === undefined ? 'law of this territory' : 'rule';
  return translation([{ type: 'agent.tool.blocked', data: { tool: call.kind, reason } }], {
    decision: denyTool(refusalText(source, reason)),
  });
}

/** `Exit code: N`, the first line of apply_patch's `tool_response`; the shell's response is its output only. */
const EXIT_LINE = /^Exit code: (\d+)/;

function postToolUse(input: ClaudeInput): Translation {
  const call = codexToolCallOf(input.raw.tool_name, input.raw.tool_input);
  const path = call.paths[0];
  const response = typeof input.raw.tool_response === 'string' ? input.raw.tool_response : '';
  const exit = EXIT_LINE.exec(response)?.[1];
  const data = withoutUndefined({
    tool: call.kind,
    path: path === undefined ? undefined : plotPath(path, input.text('cwd')),
    command: call.command,
    url: call.url,
    exit: exit === undefined ? undefined : Number(exit),
  });
  return translation([{ type: 'agent.tool', data }]);
}

const HANDLERS = new Map<string, Handler>([
  ['SessionStart', sessionStart],
  ['PreToolUse', preToolUse],
  ['PostToolUse', postToolUse],
  // The handover gate of ADR 0010: Codex reads `{"decision": "block", "reason"}` as one more turn (spike §3.4).
  ['Stop', (input, ctx) => stopGate(ctx, input.session ?? 'unknown')],
]);

/** The events the runner declares for Codex; `agent.session.end` comes from the stream, as for Claude. */
export const CODEX_HOOK_EVENTS: readonly string[] = [...HANDLERS.keys()];

/** One Codex hook call. An event Elvaria does not declare writes nothing. */
export function translateCodex(raw: Readonly<Record<string, unknown>>, ctx: HookContext): Translation {
  const input = claudeInputOf(raw);
  return HANDLERS.get(input.event)?.(input, ctx) ?? translation([]);
}
