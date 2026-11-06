// PreToolUse guards the territory laws and the apprentice rule; PostToolUse and PostToolUseFailure log
// `agent.tool` (implementation-plan §3.6, §3.10, §3.12). A call that is stopped gets a JSON `deny` on stdout,
// exit 0, which Claude Code honours even for a call its allow rules permit (spike P1-02).
import { denyTool, translation, withoutUndefined } from '../draft.ts';
import { commandViolation, forbiddenPathOf } from '../laws.ts';
import { plotPath, toolCallOf } from './tools.ts';
import type { HookContext } from '../context.ts';
import type { Translation } from '../draft.ts';
import type { CompiledLaws } from '../laws.ts';
import type { ClaudeInput } from './input.ts';
import type { ToolCall } from './tools.ts';

/**
 * The one sub-agent a character may start: the apprentice of `--agents`, capped by `maxTurns` (ADR 0017).
 * Deny rules cannot say "every agent but this one", and SubagentStart cannot block, so this check is the
 * fence; deny rules on the built-in agents are the second one (spike P1-02, §3.12).
 */
export const APPRENTICE = 'apprentice';

/** Why a sub-agent call breaks the apprentice rule, if it does. */
export function subagentViolation(call: ToolCall): string | undefined {
  if (call.subagent === undefined || call.subagent === APPRENTICE) return undefined;
  const asked = call.subagent === '' ? 'a sub-agent without subagent_type' : `sub-agent ${call.subagent}`;
  return `${asked} is not allowed; the only sub-agent is ${APPRENTICE}`;
}

/** Why `call` breaks the laws, if it does. Tools that name no file and run no command are not guarded. */
export function lawViolation(call: ToolCall, laws: CompiledLaws): string | undefined {
  if (call.guarded.length === 0 && call.command === undefined) return undefined;
  if (laws.broken !== undefined) {
    return `the territory laws could not be loaded (${laws.broken}), so file and shell tools are blocked`;
  }
  for (const raw of call.guarded) {
    const glob = forbiddenPathOf(raw, laws);
    if (glob !== undefined) return `${raw} is a forbidden path (${glob})`;
  }
  return call.command === undefined ? undefined : commandViolation(call.command, laws);
}

export function preToolUse(input: ClaudeInput, ctx: HookContext): Translation {
  const call = toolCallOf(input.raw.tool_name, input.raw.tool_input);
  const apprenticeRule = subagentViolation(call);
  const reason = apprenticeRule ?? lawViolation(call, ctx.laws);
  if (reason === undefined) return translation([]);
  const source = apprenticeRule === undefined ? 'law of this territory' : 'rule';
  return translation([{ type: 'agent.tool.blocked', data: { tool: call.kind, reason } }], {
    decision: denyTool(
      `Elvaria ${source}: ${reason}. Do not try another way around it; if the work needs it, say so in handover.md.`,
    ),
  });
}

/** `Exit code N`, the first line of a failed shell call's `error` (Claude Code hooks reference). */
const EXIT_LINE = /^Exit code (\d+)/;

function toolData(input: ClaudeInput, call: ToolCall, exit: number | undefined): Record<string, unknown> {
  const path = call.paths[0];
  const duration = input.number('duration_ms');
  return withoutUndefined({
    tool: call.kind,
    path: path === undefined ? undefined : plotPath(path, input.text('cwd')),
    command: call.command,
    url: call.url,
    exit,
    duration_ms: duration === undefined || duration < 0 ? undefined : Math.round(duration),
  });
}

export function postToolUse(input: ClaudeInput): Translation {
  const call = toolCallOf(input.raw.tool_name, input.raw.tool_input);
  return translation([{ type: 'agent.tool', data: toolData(input, call, undefined) }]);
}

/** A failed call is still a call: the same line, with the exit code when the shell gave one. */
export function postToolUseFailure(input: ClaudeInput): Translation {
  const call = toolCallOf(input.raw.tool_name, input.raw.tool_input);
  const code = call.command === undefined ? undefined : EXIT_LINE.exec(input.text('error') ?? '')?.[1];
  return translation([
    { type: 'agent.tool', data: toolData(input, call, code === undefined ? undefined : Number(code)) },
  ]);
}
