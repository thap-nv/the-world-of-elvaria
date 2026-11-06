import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import { cliOutputConfig } from './eslint-i18n.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));

// Without type information: enough for prose versus ids; typed literal unions are covered by `pnpm lint`.
const linter = new Linter({ cwd: REPO });
const configs: Linter.Config[] = [
  { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
  cliOutputConfig(),
];

const lint = (file: string, code: string): string[] =>
  linter.verify(code, configs, join(REPO, file)).map((message) => message.message);

describe('CLI output goes through i18n (ADR 0014)', () => {
  it.each([
    "out('Kingdom created');",
    "out('Đã lập vương quốc');",
    "const message = 'quest not found'; out(message);",
  ])('flags prose in apps/cli: %s', (code) => {
    expect(lint('apps/cli/src/init.ts', code).join('\n')).toContain('goes through t()');
  });

  it.each([
    "out(t('cli.init.done', { name }));",
    "spawn('git', ['rev-parse', '--show-toplevel']);",
    "readFile(file, 'utf8');",
    "const FILES = ['Kingdom created'];",
    "if (status === 'Not prose either') out(status);",
    "out('✓ · —');",
    "throw new Error('An English message for logs');",
    "join(root, 'inbox/done', '.backup');",
  ])('lets ids, flags, marks and logs through: %s', (code) => {
    expect(lint('apps/cli/src/init.ts', code)).toEqual([]);
  });

  it('applies to shipped CLI code only', () => {
    expect(lint('apps/cli/src/init.spec.ts', "out('Kingdom created');")).toEqual([]);
    expect(lint('packages/store/src/init.ts', "out('Kingdom created');")).toEqual([]);
  });
});
