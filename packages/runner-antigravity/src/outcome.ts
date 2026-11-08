// How an agy run ended (spike P1-12a §5): exit 0 done (a soft-deny too), 1 configuration, 2 command line, 3 a
// model or agent error or `--print-timeout`, with `AGY_ERROR: {json}` as a stderr line. Pure, so every row of
// the table is a test.
import type { RunOutcome } from '@elvaria/runner-core';

import type { AgyResult } from './stream.ts';

export interface AgyError {
  readonly status?: string;
  readonly reason?: string;
  readonly retryable?: boolean;
  readonly short_error?: string;
}

const PREFIX = 'AGY_ERROR: ';

/** The last `AGY_ERROR:` line of stderr, if any. */
export function agyErrorOf(stderr: string): AgyError | undefined {
  const line = stderr
    .split(/\r?\n/)
    .reverse()
    .find((text) => text.startsWith(PREFIX));
  if (line === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(line.slice(PREFIX.length));
    // Read field by field by the callers, each checked for its type where it matters.
    return typeof value === 'object' && value !== null ? value : undefined;
  } catch {
    return { short_error: line.slice(PREFIX.length) };
  }
}

/**
 * A usage limit, by agy's changelog: a personal quota is reported at once and not retried. Not seen on a real
 * machine yet (spike §10); `constructed-rate-limit.*` follows the changelog's words.
 */
const QUOTA = /resource_exhausted|quota|rate.?limit|exhausted your capacity|\b429\b/i;

/** What says the account ran out of mana, or undefined. */
export function rateLimitOf(error: AgyError | undefined, result: AgyResult | undefined): string | undefined {
  const words = [error?.status, error?.reason, error?.short_error, result?.error].filter(
    (text): text is string => typeof text === 'string' && text !== '',
  );
  return words.some((text) => QUOTA.test(text))
    ? (error?.short_error ?? result?.error ?? words[0])
    : undefined;
}

/**
 * `Resets in 4h53m54s.` in agy's quota error (agy 1.5.3, P1-16; spike §13), or the changelog's `reset after
 * 2h31m12s`: how long until the window resets.
 */
const RESETS_IN = /(?:Resets in|reset after)\s*((?:\d+[hms]\s*)+)/i;
const UNIT = /(\d+)([hms])/g;
const SECONDS = { h: 3600, m: 60, s: 1 } as const;
const MS_PER_SECOND = 1000;

/**
 * The reset a quota error names, `now` (epoch ms) plus its `Resets in …` (P1-22), so the Steward probes the pool
 * just after it instead of after probe_interval_minutes; undefined when the words do not say.
 */
export function resetsAtOf(text: string, now: number): string | undefined {
  const span = RESETS_IN.exec(text)?.[1];
  if (span === undefined) return undefined;
  let total = 0;
  for (const [, count, unit] of span.matchAll(UNIT))
    total += Number(count) * SECONDS[unit as keyof typeof SECONDS];
  return new Date(now + total * MS_PER_SECOND).toISOString();
}

export interface Ending {
  readonly exit_code: number | null;
  readonly result: AgyResult | undefined;
  readonly error: AgyError | undefined;
  /** Who stopped the run: the Steward (`killed`) or the runner's turn breaker (`max_turns`). */
  readonly stopped: 'killed' | 'max_turns' | undefined;
  readonly rate_limited: boolean;
}

const timedOut = (ending: Ending): boolean =>
  ending.result?.finished_reason === 'print_timeout' || ending.error?.reason === 'print_timeout';

/**
 * Completed means the run said so and answered: SUCCESS with denied actions is a soft-deny that ended the run
 * (a policy fault, not the quest's), and SUCCESS with no response nor structured output produced nothing.
 */
export function outcomeOf(ending: Ending): RunOutcome {
  if (ending.stopped !== undefined) return ending.stopped;
  // --print-timeout is budget.max_minutes: the time budget ran out.
  if (timedOut(ending)) return 'budget';
  const { result } = ending;
  if (ending.rate_limited || ending.exit_code !== 0 || result?.status !== 'SUCCESS') return 'error';
  if (result.denied_actions.length > 0) return 'error';
  const answered = result.response.trim() !== '' || result.structured_output !== undefined;
  return answered ? 'completed' : 'error';
}
