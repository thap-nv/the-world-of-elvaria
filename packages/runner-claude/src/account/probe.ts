// probe(): does the account answer (implementation-plan §3.5, ADR 0009; spike P1-02)? First `claude -p "/usage"`,
// which calls no model; if a window of the whole account is full, the tribe stays asleep until the latest reset.
// Otherwise one turn of the cheapest model with no tool, which costs ≈ 0.00005 USD, proves a call goes through.
import { parseJsonLine, probeNoteOf, textOf } from '@elvaria/runner-core';
import { pingArgv, usageArgv } from '../launch/argv.ts';
import { runOnce } from '../launch/run-once.ts';
import { createStreamReader } from '../session/stream.ts';
import { usageWindowsOf } from './usage.ts';
import type { Launch } from '../launch/launch.ts';
import type { Ran } from '../launch/run-once.ts';
import type { StreamReader } from '../session/stream.ts';
import type { UsageWindow } from './usage.ts';
import type { ProbeOptions, ProbeResult } from '@elvaria/runner-core';

export interface ProbeDeps {
  readonly launch: Launch;
  readonly env: Readonly<Record<string, string>>;
  readonly cwd: string;
  /** The cheapest model (`haiku`). */
  readonly model: string;
  readonly timeoutMs: number;
  readonly now: () => number;
}

const FULL_PCT = 100;

function readStream(ran: Ran): StreamReader {
  const reader = createStreamReader();
  for (const line of ran.stdout.split(/\r?\n/)) {
    const parsed = parseJsonLine(line);
    if (parsed !== undefined) reader.read(parsed);
  }
  return reader;
}

/** The windows of the whole account that are full; a cap on one model binds only its characters (P1-05). */
const fullWindows = (windows: readonly UsageWindow[]): UsageWindow[] =>
  windows.filter((window) => window.model === undefined && window.used_pct >= FULL_PCT);

/** Asleep until every full window has reset. */
function asleep(full: readonly UsageWindow[]): ProbeResult {
  const resets = full.flatMap((window) => (window.resets_at === undefined ? [] : [window.resets_at])).sort();
  const latest = resets.at(-1);
  return {
    status: 'rate_limited',
    note: probeNoteOf('probe:usage_full', { windows: full.map((window) => window.window).join(', ') }),
    ...(latest === undefined ? {} : { resets_at: latest }),
  };
}

const firstLine = (text: string): string => text.trim().split(/\r?\n/)[0] ?? '';

async function ping(deps: ProbeDeps): Promise<ProbeResult> {
  const ran = await runOnce(deps.launch, pingArgv(deps.model), deps);
  const reader = readStream(ran);
  if (reader.result !== undefined && reader.result.is_error !== true) return { status: 'ok' };
  if (reader.rateLimited) return { status: 'rate_limited', note: probeNoteOf('probe:ping_limited') };
  const text = textOf(reader.result, 'result') ?? ran.problem ?? (firstLine(ran.stderr) || undefined);
  return text === undefined
    ? { status: 'error', note: probeNoteOf('probe:ping_failed', { exit: String(ran.code) }) }
    : { status: 'error', cli_text: text };
}

/**
 * The windows it read come back with the answer, for the mana gauge (P1-05). `ping: false` stops after `/usage`:
 * how the Steward watches an awake pool without calling a model.
 */
export async function probeClaude(deps: ProbeDeps, options: ProbeOptions = {}): Promise<ProbeResult> {
  const usage = await runOnce(deps.launch, usageArgv(), deps);
  const text = textOf(readStream(usage).result, 'result');
  const windows = text === undefined ? [] : usageWindowsOf(text, deps.now());
  const read = windows.length === 0 ? {} : { windows };
  const full = fullWindows(windows);
  if (full.length > 0) return { ...asleep(full), ...read };
  if (options.ping === false) {
    const cliText = usage.problem ?? (firstLine(usage.stderr) || undefined);
    return text === undefined
      ? {
          status: 'error',
          ...(cliText === undefined
            ? { note: probeNoteOf('probe:usage_unprinted', { command: 'claude -p /usage' }) }
            : { cli_text: cliText }),
        }
      : { status: 'ok', ...read };
  }
  // An unreadable /usage (a changed text, a CLI that failed) falls back to the ping (§3.5).
  return { ...(await ping(deps)), ...read };
}
