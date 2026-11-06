// The CLI as a function of its arguments and the machine: cli.ts passes the real process, tests pass a fake one
// and read what was printed.
import { DEFAULT_LOCALE, LOCALES, isLocale, translator } from '@elvaria/i18n';
import type { Translate } from '@elvaria/i18n';

import { parseCommandArgs } from './args.ts';
import { EXIT } from './command.ts';
import { COMMANDS } from './commands.ts';
import { commandHelp, overviewHelp } from './help.ts';
import type { ArgsError } from './args.ts';
import type { CliContext, CommandSpec, ExitCode } from './command.ts';
import type { CliIo } from './io.ts';

export type Lookup =
  | { readonly kind: 'command'; readonly spec: CommandSpec; readonly rest: readonly string[] }
  | { readonly kind: 'overview'; readonly group?: string }
  | { readonly kind: 'unknown'; readonly words: string };

const HELP_WORDS = ['help', '--help', '-h'];
const LOCALE_FLAG = '--locale';

/** Command words come first, as in git: `elvaria quest add --title …`. */
export function lookupCommand(argv: readonly string[], commands: readonly CommandSpec[] = COMMANDS): Lookup {
  const [first, second] = argv;
  if (first === undefined || HELP_WORDS.includes(first)) return { kind: 'overview' };
  const group = commands.filter((spec) => spec.name[0] === first);
  const single = group.find((spec) => spec.name.length === 1);
  if (single !== undefined) return { kind: 'command', spec: single, rest: argv.slice(1) };
  if (group.length === 0) return { kind: 'unknown', words: first };
  if (second === undefined || second === 'help' || second.startsWith('-'))
    return { kind: 'overview', group: first };
  const spec = group.find((candidate) => candidate.name[1] === second);
  return spec === undefined
    ? { kind: 'unknown', words: `${first} ${second}` }
    : { kind: 'command', spec, rest: argv.slice(2) };
}

/** `--locale` read before anything else, so even a usage error comes in the language asked for. */
export function localeFlag(argv: readonly string[]): string | undefined {
  const at = argv.findIndex((arg) => arg === LOCALE_FLAG || arg.startsWith(`${LOCALE_FLAG}=`));
  if (at < 0) return undefined;
  const arg = argv[at] ?? '';
  return arg === LOCALE_FLAG ? (argv[at + 1] ?? '') : arg.slice(LOCALE_FLAG.length + 1);
}

function argsErrorText(t: Translate, error: ArgsError): string {
  switch (error.code) {
    case 'unknown_option':
      return t('cli.error.unknown_option', { option: error.option });
    case 'bad_value':
      return t('cli.error.bad_value', { option: error.option });
    case 'missing_option':
      return t('cli.error.missing_option', { option: error.option });
    case 'missing_argument':
      return t('cli.error.missing_argument', { name: error.name });
    case 'extra_argument':
      return t('cli.error.extra_argument', { value: error.value });
  }
}

async function runCommand(spec: CommandSpec, rest: readonly string[], ctx: CliContext): Promise<ExitCode> {
  const { t, io } = ctx;
  const parsed = parseCommandArgs(spec, rest);
  if (!parsed.ok) {
    io.err(argsErrorText(t, parsed.error));
    io.err(t('cli.error.see_command_help', { command: spec.name.join(' ') }));
    return EXIT.usage;
  }
  if (parsed.value.values.help === true) {
    commandHelp(t, spec).forEach(io.out);
    return EXIT.ok;
  }
  try {
    return await spec.run(parsed.value, ctx);
  } catch (error) {
    // An IO failure nobody can act on (disk full, no permission): say it in one line, not a stack trace.
    io.err(t('cli.error.unexpected', { message: error instanceof Error ? error.message : String(error) }));
    return EXIT.failed;
  }
}

export async function runCli(argv: readonly string[], io: CliIo): Promise<ExitCode> {
  const flag = localeFlag(argv);
  const locale = flag === undefined ? DEFAULT_LOCALE : isLocale(flag) ? flag : undefined;
  if (locale === undefined) {
    io.err(
      translator(DEFAULT_LOCALE)('cli.error.locale', { value: flag ?? '', choices: LOCALES.join(', ') }),
    );
    return EXIT.usage;
  }
  const t = translator(locale);
  const ctx: CliContext = { io, locale, localeFromFlag: flag !== undefined, t };
  const found = lookupCommand(argv);
  switch (found.kind) {
    case 'overview':
      overviewHelp(t, COMMANDS, found.group).forEach(io.out);
      return EXIT.ok;
    case 'unknown':
      io.err(t('cli.error.unknown_command', { command: found.words }));
      io.err(t('cli.error.see_help'));
      return EXIT.usage;
    case 'command':
      return runCommand(found.spec, found.rest, ctx);
  }
}
