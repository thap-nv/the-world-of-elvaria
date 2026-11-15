// The soft ceiling of (F), plans/phase-2.md: the Steward writes `<run_dir>/wrap-up.json` once per session, and the
// hook passes "stop, commit, write the letter" into the session at the next tool call, once. Only through the event
// and field the probe (plans/phase-2-probes/hook-reminder.md) concluded `có` for: Claude Code's PostToolUse
// `additionalContext`. Codex and agy are `chưa rõ` there, so they get nothing and the hard cut does the work. This is
// a reminder, not a fence: every failure is silent, and it never answers PreToolUse (onFailure: block).
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { errorText } from './draft.ts';
import { stateFile, writeState } from './run-state.ts';
import type { HookContext } from './context.ts';
import type { Decision } from './draft.ts';

/** The Steward's file, next to `policy.json` in the run folder. */
export const WRAP_UP_FILE = 'wrap-up.json';
const WRAP_UP_VERSION = 1;
const MEASURES: readonly string[] = ['tokens', 'minutes', 'turns'];

/** The hook branch that answers: the CLI it was called for (run-hook.ts). */
export type WrapUpCli = 'claude' | 'codex' | 'agy' | 'neutral';

interface ReminderRoute {
  /** The CLI's own event name the reminder rides on. */
  readonly event: string;
  readonly answer: (text: string) => Decision;
  /** A call made by a sub-agent: its context is not the session's, so the reminder waits for the session's own. */
  readonly fromSubagent: (payload: Readonly<Record<string, unknown>>) => boolean;
}

/**
 * The probe's conclusions as data. Claude Code: `có` (hooks reference, "Passing context to Claude"). Codex: `chưa rõ`
 * (`additionalContext` never measured, probe §2). agy: `chưa rõ` (PostToolUse has no output, probe §3). A neutral
 * dialect has no conclusion. A tribe measured `có` later gets a row here, nothing else.
 */
const ROUTES: Readonly<Record<WrapUpCli, ReminderRoute | undefined>> = {
  claude: {
    event: 'PostToolUse',
    answer: (text) => ({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } }),
    // `agent_type` is set only when an apprentice made the call (spike P1-02).
    fromSubagent: (payload) => typeof payload.agent_type === 'string' && payload.agent_type !== '',
  },
  codex: undefined,
  agy: undefined,
  neutral: undefined,
};

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

export const wrapUpText = ({ measure, used, limit, pct }: WrapUpSignal): string =>
  `Elvaria: this session has used ${Math.round(pct)}% of its ${measure} limit (${used} of ${limit}). ` +
  'Start no new work. Commit what you have, write the handover letter (Where I am / Done / Not done / Next step), ' +
  'then end the session.';

/** One marker per session, so a later session of the same run is reminded again by its own signal. */
const markerOf = (runDir: string, session: string): string => {
  const name = session.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100);
  return stateFile(runDir, `wrap-up-reminded/${name}.json`);
};

export interface WrapUpCall {
  readonly cli: WrapUpCli;
  readonly event: string | undefined;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly session: string | undefined;
}

export interface WrapUpOutcome {
  readonly decision: Decision | undefined;
  readonly problems: readonly string[];
}

const SILENT: WrapUpOutcome = { decision: undefined, problems: [] };

/**
 * The reminder for this call, at most once per session: only an assignee (the one who writes the letter and gets a
 * next session; a verifier is cut at `hard_pct`), only on the route's event, only when the file reads as v1.
 */
export function wrapUpReminder(call: WrapUpCall, ctx: HookContext): WrapUpOutcome {
  const route = ROUTES[call.cli];
  const { runDir } = ctx;
  if (route === undefined || call.event !== route.event || route.fromSubagent(call.payload)) return SILENT;
  if (ctx.role !== 'assignee' || runDir === undefined) return SILENT;
  const signal = readWrapUp(runDir);
  if (signal === undefined) return SILENT;
  try {
    // Created exclusively: two tool calls ending together still remind once.
    const first = writeState(markerOf(runDir, call.session ?? 'unknown'), { ...signal }, true);
    return first ? { decision: route.answer(wrapUpText(signal)), problems: [] } : SILENT;
  } catch (error) {
    return { decision: undefined, problems: [`wrap-up reminder not given: ${errorText(error)}`] };
  }
}
