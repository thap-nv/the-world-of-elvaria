// A command is data (name, options, help keys) plus one function, so parsing, help and the e2e test all read the
// same table (commands.ts) and a new command cannot forget its help text.
import type { Locale, MessageKey, Translate } from '@elvaria/i18n';

import type { CliIo } from './io.ts';

export interface OptionSpec {
  readonly type: 'string' | 'boolean';
  /** Repeatable: `--tag frontend --tag i18n`. */
  readonly multiple?: boolean;
  readonly short?: string;
  readonly required?: boolean;
  /** Placeholder after the flag in help, e.g. `<dir>`. */
  readonly value?: string;
  readonly help: MessageKey;
}

export interface ArgumentSpec {
  /** Placeholder in help, e.g. `<path>`. */
  readonly name: string;
  readonly help: MessageKey;
}

export type OptionValue = string | boolean | readonly (string | boolean)[] | undefined;

export interface CommandInput {
  readonly values: Readonly<Record<string, OptionValue>>;
  readonly positionals: readonly string[];
}

/** What every command gets: the machine, and the owner's language. */
export interface CliContext {
  readonly io: CliIo;
  readonly locale: Locale;
  /** True when `--locale` was given: it then wins over `kingdom.owner.locale`. */
  readonly localeFromFlag: boolean;
  readonly t: Translate;
}

/** Exit codes: 0 done, 1 refused or failed (the output says why), 2 the command line itself is wrong. */
export const EXIT = { ok: 0, failed: 1, usage: 2 } as const;
export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export interface CommandSpec {
  /** `['quest', 'add']`; one word for commands without a group (`init`). */
  readonly name: readonly string[];
  readonly summary: MessageKey;
  readonly args: readonly ArgumentSpec[];
  readonly options: Readonly<Record<string, OptionSpec>>;
  readonly run: (input: CommandInput, ctx: CliContext) => Promise<ExitCode>;
}
