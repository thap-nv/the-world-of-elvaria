// How agy (and the hook it runs) is started: the shape of `hookCommand()` of @elvaria/hooks, `{command, args}`.
// runner-core's spawn and kill tree (P1-06) take runner-core's `Launch`, `{file, args}`. agy takes its prompt on
// the command line (spike P1-12a: stdin is ignored under `-p`), and Windows stops a command line at 32 767
// characters: a judge's prompt carries a diff, so the length is checked before a session starts (P1-15).
import type { Launch as ProgramLaunch } from '@elvaria/runner-core';

/** The absolute CLI (`tribes[].tool.path`), or node + a script (an npm shim, a fake). */
export interface Launch {
  readonly command: string;
  readonly args: readonly string[];
}

export const programOf = (launch: Launch): ProgramLaunch => ({ file: launch.command, args: launch.args });

/** What CreateProcess takes on Windows: the whole command line, the program included. */
export const WINDOWS_COMMAND_LINE_MAX = 32_767;

/** Quotes around an argument and the space after it. */
const ARGUMENT_FRAME = 3;

/**
 * The longest user prompt agy is said to take on Windows (`capabilities.prompt_max_chars`, fix/verifier-prompt-limit):
 * the command line less room for the other arguments (the CLI and run files under the kingdom, every backslash
 * counted twice: under 1 000) and for the quotes and backslashes of the prompt itself, which Node escapes: one
 * character in five, more than a whole diff of JSON (DIFF_MAX_CHARS, a quote in four) beside the prose around it. The
 * Steward weighs a judge's prompt against it before choosing one; the real line is still measured here
 * (commandLineProblem) before a session starts.
 */
export const WINDOWS_PROMPT_MAX_CHARS = 26_000;

/**
 * An upper bound of the command line Node builds on Windows: every argument quoted, each of its quotes and
 * backslashes escaped (counting every backslash overestimates, which is the safe side).
 */
export function commandLineLength(launch: Launch, args: readonly string[]): number {
  return [launch.command, ...launch.args, ...args].reduce(
    (sum, arg) => sum + arg.length + (arg.match(/["\\]/g)?.length ?? 0) + ARGUMENT_FRAME,
    0,
  );
}

/** Why agy cannot be started with `args` on `platform`; undefined when it can. */
export function commandLineProblem(
  launch: Launch,
  args: readonly string[],
  platform: NodeJS.Platform,
): string | undefined {
  if (platform !== 'win32') return undefined;
  const length = commandLineLength(launch, args);
  if (length <= WINDOWS_COMMAND_LINE_MAX) return undefined;
  return `agy takes its prompt on the command line, and this one would be about ${length} characters; Windows stops at ${WINDOWS_COMMAND_LINE_MAX} (a long diff, handover letter or gazetteer)`;
}
