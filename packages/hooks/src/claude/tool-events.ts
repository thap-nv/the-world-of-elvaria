// PreToolUse guards the territory laws; PostToolUse and PostToolUseFailure log `agent.tool`
// (implementation-plan §3.6, §3.10). A guarded call that breaks a law is blocked with exit 2: Claude Code
// reads stderr as the reason (cli-facts §1.4).
import { translation, withoutUndefined } from '../draft.ts';
import { commandViolation, forbiddenPathOf } from '../laws.ts';
import { plotPath, toolCallOf } from './tools.ts';
import type { HookContext } from '../context.ts';
import type { Translation } from '../draft.ts';
import type { CompiledLaws } from '../laws.ts';
import type { ClaudeInput } from './input.ts';
import type { ToolCall } from './tools.ts';

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
  const reason = lawViolation(call, ctx.laws);
  if (reason === undefined) return translation([]);
  return translation([{ type: 'agent.tool.blocked', data: { tool: call.kind, reason } }], {
    block: `Elvaria law of this territory: ${reason}. Do not try another way around it; if the work needs it, say so in handover.md.`,
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
