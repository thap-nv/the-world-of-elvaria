// PreToolUse guards the territory laws and the apprentice rule; PostToolUse and PostToolUseFailure log
// `agent.tool` (implementation-plan §3.6, §3.10, §3.12). A call that is stopped gets a JSON `deny` on stdout,
// exit 0, which Claude Code honours even for a call its allow rules permit (spike P1-02).
import { denyTool, translation, withoutUndefined } from '../draft.ts';
import { commandViolation, forbiddenPathOf, matchingGlobOf, readOnlyReason } from '../laws.ts';
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

/**
 * Why a sub-agent call breaks the apprentice rule, if it does: another agent, or a `model` outside the ones the
 * policy allows (decided after P1-09): the character picks the apprentice's model per call, never above its own.
 */
export function subagentViolation(call: ToolCall, models?: readonly string[]): string | undefined {
  if (call.subagent === undefined) return undefined;
  if (call.subagent !== APPRENTICE) {
    const asked = call.subagent === '' ? 'a sub-agent without subagent_type' : `sub-agent ${call.subagent}`;
    return `${asked} is not allowed; the only sub-agent is ${APPRENTICE}`;
  }
  if (call.model === undefined || models === undefined || models.includes(call.model)) return undefined;
  return `model ${call.model} is not allowed for the ${APPRENTICE}, which runs on ${models.join(', ')} at most (never above your own model)`;
}

/**
 * `agent_type` of the payload: set when a sub-agent made the call (spike P1-02), so a revival and the tier report
 * tell the apprentice's work from the character's (§3.12).
 */
const callerOf = (input: ClaudeInput): { agent_type?: string } => {
  const agentType = input.text('agent_type');
  return agentType === undefined ? {} : { agent_type: agentType };
};

/**
 * Why `call` breaks the laws, if it does. Tools that name no file and run no command are not guarded; a
 * read-only path (P1-24) stops only a write tool, so a generated file stays readable.
 */
export function lawViolation(call: ToolCall, laws: CompiledLaws): string | undefined {
  if (call.guarded.length === 0 && call.command === undefined) return undefined;
  if (laws.broken !== undefined) {
    return `the territory laws could not be loaded (${laws.broken}), so file and shell tools are blocked`;
  }
  for (const raw of call.guarded) {
    const glob = forbiddenPathOf(raw, laws);
    if (glob !== undefined) return `${raw} is a forbidden path (${glob})`;
    const readOnly = call.kind === 'write' ? matchingGlobOf(raw, laws.readOnly) : undefined;
    if (readOnly !== undefined) return readOnlyReason(raw, readOnly);
  }
  return call.command === undefined ? undefined : commandViolation(call.command, laws);
}

/** The end of a patch reason (P1-28): it says what to do instead, so no "do not try another way" follows it. */
const PATCH_WAY = 'The Steward applies it when your session completes; do not ask the owner for it';

/**
 * Why the CLI will refuse this write whatever its rules say, if it will (policy `cli_protected_paths`, P1-24).
 * Claude Code 2.1.319 checks such paths before any allow rule of `--settings`, and dontAsk turns the ask into a
 * bare "denied" (P1-16 §5.9: a knight tried Write, then Edit, on `.husky/pre-push`). Said first, the model asks the
 * owner for the change instead of retrying, or writes it as the patch the territory allows (P1-28).
 */
export function protectedViolation(call: ToolCall, laws: CompiledLaws): string | undefined {
  if (call.kind !== 'write') return undefined;
  for (const raw of call.guarded) {
    const glob = matchingGlobOf(raw, laws.cliProtected);
    if (glob === undefined) continue;
    // Git's folder under a CLI that does not lock it (agy): the rule is Elvaria's, and saying "your CLI refuses" would
    // be false (P1-56, (i) of the P1-50 report: the judge read it and wrote it into its notes).
    if (laws.ownProtected.includes(glob)) {
      return `${raw} is in git's own folder (${glob}); this is a rule of Elvaria, not of your CLI: the Steward runs git for you and commits your plot, so leave the folder alone`;
    }
    const refused = `${raw} is in a path your CLI refuses to write whatever its rules say (${glob})`;
    if (laws.patchFile !== undefined && matchingGlobOf(raw, laws.patchPaths) !== undefined) {
      return `${refused}, but the territory lets the Steward change it for you: write the change as a git patch, as \`git diff\` prints it with paths from the root of your plot, to ${laws.patchFile} at the root of your plot. ${PATCH_WAY}`;
    }
    return `${refused}; finish the rest, then put the exact change in the Question section of the handover letter so the owner applies it`;
  }
  return undefined;
}

/** What the model reads when a call is stopped, from either CLI's PreToolUse. */
export const refusalText = (source: string, reason: string): string =>
  reason.endsWith(PATCH_WAY)
    ? `Elvaria ${source}: ${reason}.`
    : `Elvaria ${source}: ${reason}. Do not try another way around it; if the work needs it, say so in handover.md.`;

export function preToolUse(input: ClaudeInput, ctx: HookContext): Translation {
  const call = toolCallOf(input.raw.tool_name, input.raw.tool_input);
  const apprenticeRule = subagentViolation(call, ctx.apprenticeModels) ?? protectedViolation(call, ctx.laws);
  const reason = apprenticeRule ?? lawViolation(call, ctx.laws);
  if (reason === undefined) return translation([]);
  const source = apprenticeRule === undefined ? 'law of this territory' : 'rule';
  const data = { tool: call.kind, reason, ...callerOf(input) };
  return translation([{ type: 'agent.tool.blocked', data }], {
    decision: denyTool(refusalText(source, reason)),
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
    ...callerOf(input),
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
