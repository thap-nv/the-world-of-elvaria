// How a Codex session ended (spike Codex 2026-11-12 §1.4, §1.5, §1.11): its exit code, whether the turn completed
// or failed, who stopped it, and whether the account ran out of usage. A call the hook refused leaves no line in the
// stream, only one on stderr (spike §1.5), which is where the run's refusals are read from.
import type { PermissionDenial, RunOutcome } from '@elvaria/runner-core';

import type { CodexState } from './stream.ts';

export type Stopper = 'killed' | 'max_turns' | undefined;

/**
 * Words of Codex's usage-limit messages and error codes (`You've hit your usage limit.`, `usage_limit_reached`,
 * `rate_limit_reached`, `quota_exceeded`, from the binary, spike §1.11): not met on a real account yet, so the
 * fixture is built by hand. A word met later goes here.
 */
const RATE_LIMIT =
  /usage limit|usage_limit_reached|rate[ _]limit|quota[ _]exceeded|too many requests|\b429\b|out of credits|spend cap/i;

/** The message that says the account ran out of usage, if the run ended on one. */
export function rateLimitOf(state: Pick<CodexState, 'failure' | 'last_error'>): string | undefined {
  return [state.failure, state.last_error].find(
    (message): message is string => message !== undefined && RATE_LIMIT.test(message),
  );
}

export interface OutcomeInput {
  readonly exit_code: number | null;
  readonly state: Pick<CodexState, 'completed' | 'failure'>;
  readonly stopped: Stopper;
}

/** A kill or the turn cap first; then a turn that completed with exit 0; anything else is an error. */
export function outcomeOf(input: OutcomeInput): RunOutcome {
  if (input.stopped !== undefined) return input.stopped;
  const { completed, failure } = input.state;
  return completed && failure === undefined && input.exit_code === 0 ? 'completed' : 'error';
}

/** `…error=Command blocked by PreToolUse hook: <reason>. Command: <command>` (stream-hooks.stderr.txt). */
const BLOCKED = /blocked by PreToolUse hook: (.*?)(?:\. Command: (.*))?$/;

export interface Blocked extends PermissionDenial {
  readonly reason: string;
}

/** A refusal of the hook in one line of Codex's stderr; a refused shell line names its command. */
export function blockedOf(line: string): Blocked | undefined {
  const match = BLOCKED.exec(line.trim());
  if (match === null) return undefined;
  const reason = (match[1] ?? '').trim();
  const command = match[2]?.trim();
  return command === undefined || command === ''
    ? { tool: 'unknown', detail: reason, reason }
    : { tool: 'Bash', detail: command, reason };
}

/** Splits stderr chunks into whole lines, keeping a partial last line for the next chunk. */
export function lineSplitter(onLine: (line: string) => void): { push(chunk: string): void; end(): void } {
  let rest = '';
  return {
    push(chunk) {
      const lines = (rest + chunk).split(/\r?\n/);
      rest = lines.pop() ?? '';
      lines.forEach(onLine);
    },
    end() {
      if (rest !== '') onLine(rest);
      rest = '';
    },
  };
}
