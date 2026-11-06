import type { MessageKey, Translate } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { COMMANDS } from '../apps/cli/src/commands.ts';
import type { CommandSpec } from '../apps/cli/src/command.ts';

import { CLI_SOURCE, renderCli, usageOf } from './docs-cli.mjs';

/** Echoes the key, so the layout is visible without depending on today's wording. */
const keys: Translate = (key) => `<${key}>`;
const run = (): Promise<0> => Promise.resolve(0);

const ADD: CommandSpec = {
  name: ['territory', 'add'],
  summary: 'cli.command.territory_add' as MessageKey,
  args: [{ name: '<path>', help: 'cli.arg.path' as MessageKey }],
  options: {
    id: { type: 'string', value: '<id>', required: true, help: 'cli.option.id' as MessageKey },
    pin: { type: 'boolean', short: 'p', help: 'cli.option.pin' as MessageKey },
  },
  run,
};
const BARE: CommandSpec = {
  name: ['migrate'],
  summary: 'cli.command.migrate' as MessageKey,
  args: [],
  options: {},
  run,
};

describe('usageOf', () => {
  it('prints the command words, with its arguments unless asked not to', () => {
    expect(usageOf(ADD)).toBe('elvaria territory add <path>');
    expect(usageOf(ADD, false)).toBe('elvaria territory add');
    expect(usageOf(BARE)).toBe('elvaria migrate');
  });
});

describe('renderCli', () => {
  const text = renderCli(keys, [ADD, BARE]);

  it('starts with the title and says the doc comes from the command table', () => {
    expect(text.split('\n').slice(0, 3)).toEqual([
      '# Lệnh `elvaria`',
      '',
      `> Sinh từ bảng lệnh \`${CLI_SOURCE}\` bằng \`pnpm docs:gen\`, CI kiểm drift: sửa nguồn rồi chạy lại lệnh, không sửa file này.`,
    ]);
  });

  it('lists every command with its arguments and summary', () => {
    expect(text).toContain(
      '| Lệnh | Việc |\n|---|---|\n| `elvaria territory add <path>` | <cli.command.territory_add> |\n| `elvaria migrate` | <cli.command.migrate> |\n',
    );
  });

  it('gives the global options once, pipes escaped so the table holds', () => {
    expect(text).toContain('## Tùy chọn chung\n\nMọi lệnh đều nhận:\n\n| Tùy chọn | Ý nghĩa |\n');
    expect(text).toContain('| `--locale <vi\\|en>` | <cli.option.locale> |\n');
    expect(text).toContain('| `-h, --help` | <cli.option.help> |\n');
  });

  it('gives each command a section: arguments, then options as help prints them, required ones marked', () => {
    expect(text).toContain(
      [
        '## `elvaria territory add`',
        '',
        '<cli.command.territory_add>',
        '',
        '| Tham số / tùy chọn | Ý nghĩa |',
        '|---|---|',
        '| `<path>` | <cli.arg.path> |',
        '| `--id <id>` | <cli.option.id> <cli.help.required> |',
        '| `-p, --pin` | <cli.option.pin> |',
      ].join('\n'),
    );
  });

  it('says so when a command has nothing of its own, and ends in one newline', () => {
    expect(text).toContain(
      '## `elvaria migrate`\n\n<cli.command.migrate>\n\nKhông có tham số riêng, chỉ các tùy chọn chung.\n',
    );
    expect(text.endsWith('chung.\n')).toBe(true);
  });

  it('renders the real table in Vietnamese by default, one section per command', () => {
    const real = renderCli();
    for (const spec of COMMANDS) expect(real).toContain(`\n## \`${usageOf(spec, false)}\`\n`);
    expect(real).toContain('`--kingdom <dir>` | Thư mục vương quốc');
    expect(real).toContain('(bắt buộc)');
    expect(real).not.toContain('<cli.');
  });
});
