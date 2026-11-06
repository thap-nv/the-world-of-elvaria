// Help is rendered from the command table, in the owner's language, so it cannot drift from what parses.
import type { Translate } from '@elvaria/i18n';

import { GLOBAL_OPTIONS } from './args.ts';
import { renderTable } from './table.ts';
import type { CommandSpec, OptionSpec } from './command.ts';

const INDENT = '  ';
const indent = (lines: readonly string[]): string[] => lines.map((line) => `${INDENT}${line}`);

export function optionLabel(name: string, option: OptionSpec): string {
  const flag = option.short === undefined ? `--${name}` : `-${option.short}, --${name}`;
  return option.value === undefined ? flag : `${flag} ${option.value}`;
}

function optionRows(t: Translate, options: Readonly<Record<string, OptionSpec>>): string[][] {
  return Object.entries(options).map(([name, option]) => [
    optionLabel(name, option),
    option.required === true ? `${t(option.help)} ${t('cli.help.required')}` : t(option.help),
  ]);
}

/** `elvaria` alone, or one group (`elvaria quest`): the commands and what each does. */
export function overviewHelp(t: Translate, commands: readonly CommandSpec[], group?: string): string[] {
  const shown = commands.filter((spec) => group === undefined || spec.name[0] === group);
  const rows = shown.map((spec) => [spec.name.join(' '), t(spec.summary)]);
  return [
    group === undefined ? t('cli.help.usage') : t('cli.help.usage_group', { group }),
    '',
    t('cli.help.commands'),
    ...indent(renderTable(rows)),
    '',
    t('cli.help.global_options'),
    ...indent(renderTable(optionRows(t, GLOBAL_OPTIONS))),
    '',
    t('cli.help.more'),
  ];
}

export function commandHelp(t: Translate, spec: CommandSpec): string[] {
  const words = ['elvaria', ...spec.name, ...spec.args.map((arg) => arg.name)].join(' ');
  const rows = [
    ...spec.args.map((arg) => [arg.name, t(arg.help)]),
    ...optionRows(t, spec.options),
    ...optionRows(t, GLOBAL_OPTIONS),
  ];
  return [
    t('cli.help.usage_command', { command: words }),
    '',
    t(spec.summary),
    '',
    t('cli.help.options'),
    ...indent(renderTable(rows)),
  ];
}
