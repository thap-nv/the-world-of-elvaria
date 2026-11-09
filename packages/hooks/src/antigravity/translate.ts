// The four agy hook events the runner declares in `.agents/hooks.json` (implementation-plan §3.7, spike P1-12a
// §4), each turned into at most one line of the event log (§3.10). PreToolUse always answers: agy reads a
// missing decision as a block, and a soft-deny under `-p` would end the whole run (spike §1 #12).
import { translation, withoutUndefined } from '../draft.ts';
import { recordHandoverStart, stopGate } from '../handover.ts';
import { lawViolation, protectedViolation, refusalText } from '../claude/tool-events.ts';
import { plotPath } from '../claude/tools.ts';
import { modelSlugOf } from '../claude/translate.ts';
import { agyInputOf } from './input.ts';
import { AGY_ASK_TOOLS, agyToolCallOf, missingClassTools } from './tools.ts';
import type { HookContext } from '../context.ts';
import type { Decision, Translation } from '../draft.ts';
import type { AgyInput } from './input.ts';

type Handler = (input: AgyInput, ctx: HookContext) => Translation;

/**
 * "The CLI's own check decides": an allow rule of `--settings` runs the call, anything else is a hard deny the
 * model sees and works around. Never `allow` (does not pass review, so a soft-deny ends the run) nor
 * `auto_approve` (also skips `permissions.deny`), spike §4, ADR 0018.
 */
export const DEFER_TO_SETTINGS: Decision = { decision: 'deny_unless_prior_grant' };

/** agy's hard deny: the call does not run, and the model reads `reason`. */
export const denyAgyTool = (reason: string): Decision => ({ decision: 'deny', reason });

const SUBAGENT_REASON = 'sub-agents are not allowed for this tribe yet; do the work yourself';
const ASK_REASON =
  'nobody answers inside this session; write your question in the Question section of the handover letter and end the session';

/** Why an Elvaria rule (not a territory law) stops this tool, if one does. */
function ruleViolation(name: unknown, subagent: string | undefined, ctx: HookContext): string | undefined {
  if (subagent !== undefined) return `${subagent}: ${SUBAGENT_REASON}`;
  if (typeof name !== 'string') return undefined;
  if (AGY_ASK_TOOLS.includes(name)) return `${name}: ${ASK_REASON}`;
  const missing = missingClassTools(name, ctx.tools);
  return missing === undefined
    ? undefined
    : `${name}: your class has no ${missing.join(' or ')}; do the work with the tools you have`;
}

function preToolUse(input: AgyInput, ctx: HookContext): Translation {
  const call = agyToolCallOf(input.toolName, input.toolArgs);
  const rule = ruleViolation(input.toolName, call.subagent, ctx) ?? protectedViolation(call, ctx.laws);
  const reason = rule ?? lawViolation(call, ctx.laws);
  if (reason === undefined) return translation([], { decision: DEFER_TO_SETTINGS });
  const source = rule === undefined ? 'law of this territory' : 'rule';
  return translation([{ type: 'agent.tool.blocked', data: { tool: call.kind, reason } }], {
    decision: denyAgyTool(refusalText(source, reason)),
  });
}

/** agy's PostToolUse has no output and no exit code: those stay in the stream, which the runner reads. */
function postToolUse(input: AgyInput): Translation {
  const call = agyToolCallOf(input.toolName, input.toolArgs);
  const path = call.paths[0];
  const data = withoutUndefined({
    tool: call.kind,
    path: path === undefined ? undefined : plotPath(path, input.workspace),
    command: call.command,
    url: call.url,
  });
  return translation([{ type: 'agent.tool', data }]);
}

/** A sub-agent's own session start writes nothing: stage 1 denies them, and the runner reads the stream. */
function sessionStart(input: AgyInput, ctx: HookContext): Translation {
  if (input.subagent) return translation([]);
  const data = { session: input.session ?? 'unknown', model: modelSlugOf(input.model ?? ctx.model) };
  return translation([{ type: 'agent.session.start', data }], { problems: recordHandoverStart(ctx) });
}

/**
 * The handover gate of ADR 0010. agy's Stop answers `continue` (one more turn, the reason as a system message,
 * spike §1 #19) where Claude's answers `block`; the gate and its count are the same.
 */
function stop(input: AgyInput, ctx: HookContext): Translation {
  if (input.subagent) return translation([]);
  const gate = stopGate(ctx, input.session ?? 'unknown');
  const reason = gate.decision?.reason;
  if (typeof reason !== 'string') return gate;
  return { ...gate, decision: { decision: 'continue', reason } };
}

const HANDLERS = new Map<string, Handler>([
  ['SessionStart', sessionStart],
  ['PreToolUse', preToolUse],
  ['PostToolUse', postToolUse],
  ['Stop', stop],
]);

/** The events the runner declares in `.agents/hooks.json`; PreInvocation and PostInvocation are not declared. */
export const ANTIGRAVITY_HOOK_EVENTS: readonly string[] = [...HANDLERS.keys()];

/** One agy hook call; `event` comes from argv. An event Elvaria does not declare writes nothing. */
export function translateAntigravity(
  raw: Readonly<Record<string, unknown>>,
  event: string,
  ctx: HookContext,
): Translation {
  const input = agyInputOf(raw, event);
  return HANDLERS.get(event)?.(input, ctx) ?? translation([]);
}
