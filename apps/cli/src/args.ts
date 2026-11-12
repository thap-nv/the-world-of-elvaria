// Command-line parsing on Node's own util.parseArgs: no dependency, strict about unknown options, and errors become
// codes the caller translates (ADR 0014) instead of Node's English messages.
import { parseArgs } from 'node:util';

import { err, ok } from '@elvaria/domain';
import type { Result } from '@elvaria/domain';

import type { CommandInput, CommandSpec, OptionSpec } from './command.ts';

/** Accepted by every command. */
export const GLOBAL_OPTIONS: Readonly<Record<string, OptionSpec>> = {
  kingdom: { type: 'string', value: '<dir>', help: 'cli.option.kingdom' },
  locale: { type: 'string', value: '<vi|en>', help: 'cli.option.locale' },
  help: { type: 'boolean', short: 'h', help: 'cli.option.help' },
  // Read before parsing (upgrade/pin.ts, PS-04b); every command accepts it so it can be put on any line.
  here: { type: 'boolean', help: 'cli.option.here' },
};

export type ArgsError =
  | { readonly code: 'unknown_option'; readonly option: string }
  /** A string option without its value, or a value given to a flag. */
  | { readonly code: 'bad_value'; readonly option: string }
  | { readonly code: 'missing_option'; readonly option: string }
  | { readonly code: 'missing_argument'; readonly name: string }
  | { readonly code: 'extra_argument'; readonly value: string };

type ParseArgsOptions = NonNullable<Parameters<typeof parseArgs>[0]>['options'];

const toParseArgs = (options: Readonly<Record<string, OptionSpec>>): ParseArgsOptions =>
  Object.fromEntries(
    Object.entries(options).map(([name, spec]) => [
      name,
      {
        type: spec.type,
        ...(spec.multiple === true ? { multiple: true } : {}),
        ...(spec.short === undefined ? {} : { short: spec.short }),
      },
    ]),
  );

/** parseArgs throws a TypeError with a `code` and the option quoted in its message. */
function argsErrorOf(error: unknown): ArgsError {
  const code = error instanceof Error && 'code' in error ? error.code : undefined;
  const message = error instanceof Error ? error.message : '';
  const option = (/'([^']+)'/.exec(message)?.[1] ?? '').split(' ')[0] ?? '';
  if (code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') return { code: 'unknown_option', option };
  if (code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') return { code: 'bad_value', option };
  // Anything else is a mistake in a command's spec, not in the owner's input.
  throw error;
}

/** Options and positionals of `argv` (the words after the command name) for `spec`. */
export function parseCommandArgs(
  spec: CommandSpec,
  argv: readonly string[],
): Result<CommandInput, ArgsError> {
  const options = { ...GLOBAL_OPTIONS, ...spec.options };
  let parsed: ReturnType<typeof parseArgs>;
  try {
    // allowNegative: `--no-seal` turns a flag off (quest edit).
    parsed = parseArgs({
      args: [...argv],
      options: toParseArgs(options),
      allowPositionals: true,
      allowNegative: true,
      strict: true,
    });
  } catch (error) {
    return err(argsErrorOf(error));
  }
  const input: CommandInput = { values: parsed.values, positionals: parsed.positionals };
  // Help is always answerable, even for a command line that is otherwise incomplete.
  if (input.values.help === true) return ok(input);
  const missing = Object.entries(options).find(
    ([name, option]) => option.required === true && input.values[name] === undefined,
  );
  if (missing !== undefined) return err({ code: 'missing_option', option: `--${missing[0]}` });
  const absent = spec.args[input.positionals.length];
  if (absent !== undefined && absent.optional !== true)
    return err({ code: 'missing_argument', name: absent.name });
  const extra = input.positionals[spec.args.length];
  if (extra !== undefined) return err({ code: 'extra_argument', value: extra });
  return ok(input);
}

export function textOption(input: CommandInput, name: string): string | undefined {
  const value = input.values[name];
  return typeof value === 'string' ? value : undefined;
}

/** A repeatable string option, in the order given. */
export function textOptions(input: CommandInput, name: string): string[] {
  const value = input.values[name];
  if (typeof value === 'string') return [value];
  if (typeof value !== 'object') return [];
  return value.filter((item) => typeof item === 'string');
}

export function flagOption(input: CommandInput, name: string): boolean | undefined {
  const value = input.values[name];
  return typeof value === 'boolean' ? value : undefined;
}
