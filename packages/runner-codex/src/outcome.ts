// How a Codex session ended (spike Codex 2026-11-12 §1.4, §1.5, §1.11): its exit code, whether the turn completed
// or failed, who stopped it, and whether the account ran out of usage. A call the hook refused leaves no line in the
// stream, only one on stderr (spike §1.5), which is where the run's refusals are read from.
import { isJsonObject, jsonOfText } from '@elvaria/runner-core';
import type { LineSessionStart, PermissionDenial, RunOutcome, Stopper } from '@elvaria/runner-core';

import { withoutNulls } from './strict-schema.ts';
import type { CodexState } from './stream.ts';

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

/**
 * The answer's JSON object, under `--output-schema` the whole last message (spike §1.9), without the nulls the strict
 * schema made the model write for the keys it left out (strict-schema.ts): the core sees the shape it asked for.
 */
function structuredOf(messages: readonly string[]): unknown {
  const value = jsonOfText(messages.at(-1));
  return isJsonObject(value) ? withoutNulls(value) : undefined;
}

/**
 * What runner-core's line session leaves to Codex: the hook's refusals, read line by line from stderr (the stream has
 * no line for them, spike §1.5; the Steward hears each, RunResult lists them), and the verdict of the end.
 */
export function codexEnding(
  structured: boolean,
): Pick<LineSessionStart<CodexState>, 'stderrLine' | 'verdict'> {
  const denials: PermissionDenial[] = [];
  return {
    stderrLine: (line) => {
      const blocked = blockedOf(line);
      if (blocked === undefined) return [];
      denials.push({ tool: blocked.tool, detail: blocked.detail });
      return [{ kind: 'tool_blocked', tool: blocked.tool, reason: blocked.reason }];
    },
    verdict: ({ state, exit, stopped }) => {
      const limit = rateLimitOf(state);
      const answer = structured ? structuredOf(state.messages) : undefined;
      return {
        outcome: outcomeOf({ exit_code: exit.code, state, stopped }),
        ...(limit === undefined ? {} : { rate_limit: { detail: limit } }),
        ...(answer === undefined ? {} : { structured: answer }),
        denials,
      };
    },
  };
}
