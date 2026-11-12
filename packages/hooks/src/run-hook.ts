// One hook call, from stdin to stdout and stderr, with every input passed in so specs run it in-process
// (implementation-plan §3.6). elvaria-hook.ts wires it to the real process. The exit code is always 0: a
// decision travels as JSON on stdout (draft.ts).
import { argvEvent } from './antigravity/input.ts';
import { denyAgyTool, translateAntigravity } from './antigravity/translate.ts';
import { translateClaude } from './claude/translate.ts';
import { translateCodex } from './codex/translate.ts';
import { flagValue, loadContext } from './context.ts';
import { denyTool, errorText, translation } from './draft.ts';
import { appendDrafts, intlTs } from './write.ts';
import type { HookContext, HookEnv } from './context.ts';
import type { Translation } from './draft.ts';
import type { TsFormat } from './write.ts';

export interface HookIo {
  /** The CLI's payload, JSON. */
  readonly stdin: string;
  readonly env: HookEnv;
  /** Arguments after the script: `--policy <file>`, and for agy the event first (`PreToolUse --policy <file>`). */
  readonly argv: readonly string[];
  /** Epoch ms of this call. */
  readonly now: number;
  /** How `ts` is written; default Intl. The hook process sets its own TZ instead (elvaria-hook.ts). */
  readonly tsFormat?: TsFormat;
}

export interface HookOutcome {
  /** The decision as one JSON line when the call is stopped (a law, the apprentice rule, the letter); else ''. */
  readonly stdout: string;
  /** Notes for the run's log: missing context, failed writes. Never read as a decision. */
  readonly stderr: string;
}

const PREFIX = 'elvaria-hook';

function payloadOf(stdin: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(stdin);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

const notes = (problems: readonly string[]): string =>
  problems.map((problem) => `${PREFIX}: ${problem}\n`).join('');

const textAt = (payload: Readonly<Record<string, unknown>>, key: string): string | undefined => {
  const value = payload[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
};

/**
 * `--event <name>` in a Claude hook's argv. Claude names its event only in the payload, so the runner gives the
 * PreToolUse handler `--event PreToolUse` (P1-36): the one event that must still answer when the payload is
 * unreadable. agy carries every event as the first positional argument instead (spike P1-12a §4).
 */
const EVENT_FLAG = '--event';

/**
 * `--dialect codex`: a Codex CLI call (P1-12d). Its payload has Claude Code's shape, so nothing in it tells the two
 * apart; the runner's hook command says so instead. Any other value is ignored.
 */
const DIALECT_FLAG = '--dialect';
const CODEX = 'codex';

/** Who called: agy (its event in argv), Codex (the dialect flag), else Claude Code. */
type Caller = { readonly cli: 'agy'; readonly event: string } | { readonly cli: 'codex' | 'claude' };

function callerOf(argv: readonly string[]): Caller {
  const agyEvent = argvEvent(argv);
  if (agyEvent !== undefined) return { cli: 'agy', event: agyEvent };
  return { cli: flagValue(argv, DIALECT_FLAG) === CODEX ? 'codex' : 'claude' };
}

/** What `agent.tool.blocked` says when the payload could not be read; the model reads it with a way on. */
export const UNREADABLE_REASON =
  'the hook could not read this tool call (its input was empty, cut short or not a JSON object), so the laws could not be checked';

/**
 * PreToolUse fails closed (ADR 0007, P1-36): a call the hook cannot read is denied as a forbidden one is, since
 * letting it through would skip the laws. The read itself is what failed, so the model may try the call again.
 */
function unreadableCall(agy: boolean): Translation {
  const text = `Elvaria rule: ${UNREADABLE_REASON}. Make the same call again; if it is blocked again, say so in handover.md.`;
  return translation([{ type: 'agent.tool.blocked', data: { tool: 'other', reason: UNREADABLE_REASON } }], {
    decision: agy ? denyAgyTool(text) : denyTool(text),
    problems: ['stdin is not a JSON object; the tool call is denied'],
  });
}

function translate(
  payload: Record<string, unknown> | undefined,
  caller: Caller,
  ctx: HookContext,
): Translation {
  if (payload === undefined) return unreadableCall(caller.cli === 'agy');
  if (caller.cli === 'agy') return translateAntigravity(payload, caller.event, ctx);
  return caller.cli === 'codex' ? translateCodex(payload, ctx) : translateClaude(payload, ctx);
}

/**
 * Claude and Codex name their event in the payload; agy does not, so its hook command carries the event in argv
 * (spike P1-12a §4). A payload that is not a JSON object denies a PreToolUse call and is ignored elsewhere.
 */
export async function runHook(io: HookIo): Promise<HookOutcome> {
  const payload = payloadOf(io.stdin);
  const caller = callerOf(io.argv);
  const event = caller.cli === 'agy' ? caller.event : flagValue(io.argv, EVENT_FLAG);
  if (payload === undefined && event !== 'PreToolUse')
    return { stdout: '', stderr: notes(['stdin is not a JSON object; ignored']) };
  const ctx = loadContext(io.env, io.argv);
  const result = translate(payload, caller, ctx);
  const session =
    payload === undefined
      ? undefined
      : textAt(payload, caller.cli === 'agy' ? 'conversationId' : 'session_id');
  let written: string[];
  try {
    written = await appendDrafts(result.drafts, ctx, {
      session,
      now: io.now,
      tsFormat: io.tsFormat ?? intlTs,
    });
  } catch (error) {
    written = [`events not written: ${errorText(error)}`];
  }
  return {
    stdout: result.decision === undefined ? '' : `${JSON.stringify(result.decision)}\n`,
    stderr: notes([...ctx.problems, ...result.problems, ...written]),
  };
}
