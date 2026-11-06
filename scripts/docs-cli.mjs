// docs/cli.md: every `elvaria` command with its arguments and options, rendered from the command table that also
// drives parsing and --help (apps/cli/src/commands.ts), so the reference cannot drift from what parses
// (implementation-plan §5.4, decided after P0-08). Strings come through t() in Vietnamese, like every doc in docs/.
import { translator } from '@elvaria/i18n';

import { GLOBAL_OPTIONS } from '../apps/cli/src/args.ts';
import { EXIT } from '../apps/cli/src/command.ts';
import { COMMANDS } from '../apps/cli/src/commands.ts';
import { optionLabel } from '../apps/cli/src/help.ts';

import { code, generatedNote, markdownDocument, table } from './docs-markdown.mjs';

/** @typedef {import('../apps/cli/src/command.ts').CommandSpec} CommandSpec */
/** @typedef {import('../apps/cli/src/command.ts').OptionSpec} OptionSpec */
/** @typedef {import('@elvaria/i18n').Translate} Translate */

export const CLI_SOURCE = 'apps/cli/src/commands.ts';

/** `elvaria quest add`, or with its arguments `elvaria territory add <path>`. */
export function usageOf(/** @type {CommandSpec} */ spec, withArgs = true) {
  const args = withArgs ? spec.args.map((arg) => arg.name) : [];
  return ['elvaria', ...spec.name, ...args].join(' ');
}

/**
 * One row per option, the flag as help prints it and the help text, marked when required.
 * @param {Translate} t
 * @param {Readonly<Record<string, OptionSpec>>} options
 */
function optionRows(t, options) {
  return Object.entries(options).map(([name, option]) => [
    code(optionLabel(name, option)),
    option.required === true ? `${t(option.help)} ${t('cli.help.required')}` : t(option.help),
  ]);
}

/** @param {Translate} t @param {CommandSpec} spec */
function commandSection(t, spec) {
  const rows = [...spec.args.map((arg) => [code(arg.name), t(arg.help)]), ...optionRows(t, spec.options)];
  const body =
    rows.length === 0
      ? 'Không có tham số riêng, chỉ các tùy chọn chung.'
      : table(['Tham số / tùy chọn', 'Ý nghĩa'], rows);
  return [`## ${code(usageOf(spec, false))}`, t(spec.summary), body].join('\n\n');
}

const [OK, FAILED, USAGE] = [EXIT.ok, EXIT.failed, EXIT.usage].map((exit) => code(String(exit)));
const INTRO = [
  'Trong repo: `pnpm elvaria <lệnh>` (Node 24 chạy thẳng `apps/cli/src/cli.ts`, không build); bản build:',
  '`node apps/cli/dist/cli.js` sau `pnpm --filter @elvaria/cli build`. Vương quốc lấy từ `--kingdom` hoặc biến',
  `\`ELVARIA_KINGDOM\`. Mã thoát: ${OK} xong, ${FAILED} bị từ chối hoặc lỗi (output nói vì sao), ${USAGE} sai`,
  'dòng lệnh. Chuỗi in ra theo ngôn ngữ của vương quốc (`--locale` thắng); tài liệu này là bản `vi`. Lệnh mà',
  'task sau thêm vào bảng lệnh thì tự có ở đây.',
].join('\n');

/**
 * The whole of docs/cli.md.
 * @param {Translate} t
 * @param {readonly CommandSpec[]} commands
 */
export function renderCli(t = translator('vi'), commands = COMMANDS) {
  const overview = commands.map((spec) => [code(usageOf(spec)), t(spec.summary)]);
  return markdownDocument([
    '# Lệnh `elvaria`',
    generatedNote(`bảng lệnh ${code(CLI_SOURCE)}`),
    INTRO,
    table(['Lệnh', 'Việc'], overview),
    '## Tùy chọn chung',
    'Mọi lệnh đều nhận:',
    table(['Tùy chọn', 'Ý nghĩa'], optionRows(t, GLOBAL_OPTIONS)),
    ...commands.map((spec) => commandSection(t, spec)),
  ]);
}
