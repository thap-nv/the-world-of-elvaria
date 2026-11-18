// The soft ceiling of (F), docs/plans/phase-2-plan.md: the Steward writes `<run_dir>/wrap-up.json` once per session,
// and the hook passes "stop, commit, write the letter" into the session at a tool call, once. Claude Code hears it
// through PostToolUse `additionalContext`, the route the probe (docs/plans/phase-2-probes/hook-reminder.md) concluded
// `có` for. Codex and agy, `chưa rõ` there, hear it as the reason of one denied PreToolUse call: both were measured to
// show that reason to the model, which goes on (fix/stop-letter (i), fix/wrap-up-agy-codex). The call held back is
// never one that writes the letter or commits. A reminder, not a fence: every failure is silent, and the denied call
// may simply be made again.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { agyInputOf } from './antigravity/input.ts';
import { agyToolCallOf } from './antigravity/tools.ts';
import { denyAgyTool } from './antigravity/translate.ts';
import { codexToolCallOf } from './codex/tools.ts';
import { denyTool, errorText } from './draft.ts';
import { stateFile, writeState } from './run-state.ts';
import type { AgyInput } from './antigravity/input.ts';
import type { ToolCall } from './claude/tools.ts';
import type { HookContext } from './context.ts';
import type { Decision } from './draft.ts';

/** The Steward's file, next to `policy.json` in the run folder. */
export const WRAP_UP_FILE = 'wrap-up.json';
const WRAP_UP_VERSION = 1;
const MEASURES: readonly string[] = ['tokens', 'minutes', 'turns'];

/** The hook branch that answers: the CLI it was called for (run-hook.ts). */
export type WrapUpCli = 'claude' | 'codex' | 'agy' | 'neutral';

type Payload = Readonly<Record<string, unknown>>;

interface ReminderRoute {
  /** The CLI's own event name the reminder rides on. */
  readonly event: string;
  readonly answer: (text: string) => Decision;
  /** A call made by a sub-agent: its context is not the session's, so the reminder waits for the session's own. */
  readonly fromSubagent: (payload: Payload) => boolean;
  /** The tool call, for a route that holds one back: a call already wrapping up is let through. */
  readonly callOf?: (payload: Payload) => ToolCall;
}

/** Said after the reminder when it rides on a denied call, so the model does not read the denial as a rule. */
export const HELD_BACK =
  'This one tool call was held back to tell you so; nothing else is blocked, so make it again if you need it.';

const agyCall = (payload: Payload): AgyInput => agyInputOf(payload, 'PreToolUse');

/**
 * The routes as data. Claude Code: `có` (hooks reference, "Passing context to Claude"). Codex and agy: the
 * PreToolUse deny, whose reason both show the model (cli-facts 2026-11-12, spike Antigravity §1). A neutral dialect
 * has no measured route. A tribe measured to read context without a deny later gets its row changed, nothing else.
 */
const ROUTES: Readonly<Record<WrapUpCli, ReminderRoute | undefined>> = {
  claude: {
    event: 'PostToolUse',
    answer: (text) => ({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } }),
    // `agent_type` is set only when an apprentice made the call (spike P1-02).
    fromSubagent: (payload) => typeof payload.agent_type === 'string' && payload.agent_type !== '',
  },
  codex: {
    event: 'PreToolUse',
    answer: (text) => denyTool(`${text} ${HELD_BACK}`),
    // Codex's sub-agents are refused outright (codex/translate.ts): every call that gets here is the session's.
    fromSubagent: () => false,
    callOf: (payload) => codexToolCallOf(payload.tool_name, payload.tool_input),
  },
  agy: {
    event: 'PreToolUse',
    answer: (text) => denyAgyTool(`${text} ${HELD_BACK}`),
    fromSubagent: (payload) => agyCall(payload).subagent,
    callOf: (payload) => {
      const { toolName, toolArgs } = agyCall(payload);
      return agyToolCallOf(toolName, toolArgs);
    },
  },
  neutral: undefined,
};

const LETTER = 'handover.md';
/** `git commit` whatever options stand between, as runner-core's NO_PUSH_COMMAND reads `push`. */
const COMMIT = /\bgit(?:\s+-{1,2}[\w-]+(?:[=\s][^\s;&|]+)?)*\s+commit\b/;

/** A call that already wraps up: it names the handover letter, or its shell line commits. */
export function wrapsUp(call: ToolCall): boolean {
  if (call.paths.some((file) => file.split(/[\\/]/).at(-1) === LETTER)) return true;
  return call.command !== undefined && (call.command.includes(LETTER) || COMMIT.test(call.command));
}

export interface WrapUpSignal {
  readonly measure: string;
  readonly used: number;
  readonly limit: number;
  readonly pct: number;
}

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** The signal of `<runDir>/wrap-up.json`; undefined when it is missing or not the v1 shape. */
export function readWrapUp(runDir: string): WrapUpSignal | undefined {
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path.join(runDir, WRAP_UP_FILE), 'utf8'));
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const { version, measure, used, limit, pct } = value as Record<string, unknown>;
  if (version !== WRAP_UP_VERSION || typeof measure !== 'string') return undefined;
  if (!MEASURES.includes(measure) || !isCount(used) || !isCount(limit) || !isCount(pct)) return undefined;
  return { measure, used, limit, pct };
}

const LETTER_SECTIONS = 'Where I am / Done / Not done / Next step';

/**
 * The reminder. A class without a shell (a scribe, on any tribe) cannot commit: the Steward commits what the
 * session leaves when it ends (implementation-plan §3.3), as the assignee prompt says, so it is told that instead.
 */
export const wrapUpText = ({ measure, used, limit, pct }: WrapUpSignal, commits = true): string =>
  `Elvaria: this session has used ${Math.round(pct)}% of its ${measure} limit (${used} of ${limit}). ` +
  'Start no new work. ' +
  (commits
    ? `Commit what you have, write the handover letter (${LETTER_SECTIONS}), then end the session.`
    : `Write the handover letter (${LETTER_SECTIONS}), then end the session; the Steward commits what you leave in the plot.`);

/** Whether the session can commit: its class has a shell, or the policy does not say (the CLI enforces the class). */
const commitsOf = (ctx: HookContext): boolean => ctx.tools === undefined || ctx.tools.includes('Bash');

/** One marker per session, so a later session of the same run is reminded again by its own signal. */
const markerOf = (runDir: string, session: string): string => {
  const name = session.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100);
  return stateFile(runDir, `wrap-up-reminded/${name}.json`);
};

export interface WrapUpCall {
  readonly cli: WrapUpCli;
  readonly event: string | undefined;
  readonly payload: Payload;
  readonly session: string | undefined;
}

export interface WrapUpOutcome {
  readonly decision: Decision | undefined;
  readonly problems: readonly string[];
}

const SILENT: WrapUpOutcome = { decision: undefined, problems: [] };

/** The route this call may carry the reminder on: its CLI's event, the session's own call, not one wrapping up. */
function routeFor(call: WrapUpCall): ReminderRoute | undefined {
  const route = ROUTES[call.cli];
  if (route === undefined || call.event !== route.event || route.fromSubagent(call.payload)) return undefined;
  return route.callOf !== undefined && wrapsUp(route.callOf(call.payload)) ? undefined : route;
}

/**
 * The reminder for this call, at most once per session: only an assignee (the one who writes the letter and gets a
 * next session; a verifier is cut at `hard_pct`), only on the route's event, only when the file reads as v1.
 */
export function wrapUpReminder(call: WrapUpCall, ctx: HookContext): WrapUpOutcome {
  const route = routeFor(call);
  const { runDir } = ctx;
  if (route === undefined || ctx.role !== 'assignee' || runDir === undefined) return SILENT;
  const signal = readWrapUp(runDir);
  if (signal === undefined) return SILENT;
  try {
    // Created exclusively: two tool calls together still remind once.
    const first = writeState(markerOf(runDir, call.session ?? 'unknown'), { ...signal }, true);
    return first ? { decision: route.answer(wrapUpText(signal, commitsOf(ctx))), problems: [] } : SILENT;
  } catch (error) {
    return { decision: undefined, problems: [`wrap-up reminder not given: ${errorText(error)}`] };
  }
}
