import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ESLint, Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import { boundaryConfigs, pureDomainConfig, restrictedImportPatterns } from './eslint-boundaries.mjs';
import { elvaria } from './eslint.mjs';

const REPO = fileURLToPath(new URL('../..', import.meta.url));

// Only the boundary rules, without type information: they look at import specifiers, not types.
const linter = new Linter({ cwd: REPO });
const configs: Linter.Config[] = [
  { files: ['**/*.{ts,mjs}'], languageOptions: { parser: tseslint.parser } },
  ...boundaryConfigs(),
  pureDomainConfig([]),
];

/** Messages ESLint reports for `code` placed at `file`, a path from the repo root. */
const lint = (file: string, code: string): string[] =>
  linter.verify(code, configs, join(REPO, file)).map((message) => message.message);

describe('workspace imports follow boundaries.mjs', () => {
  it.each([
    [
      'packages/domain/src/quest.ts',
      "import { x } from '@elvaria/store';",
      'domain may not import @elvaria/store',
    ],
    [
      'packages/domain/src/quest.ts',
      "import type { X } from '@elvaria/eventlog';",
      'may not import @elvaria/eventlog',
    ],
    [
      'packages/domain/src/index.ts',
      "export { x } from '@elvaria/store';",
      'domain may not import @elvaria/store',
    ],
    [
      'packages/herald/src/server.ts',
      "import { t } from '@elvaria/steward';",
      'herald may not import @elvaria/steward',
    ],
    [
      'packages/steward/src/tick.ts',
      "import { r } from '@elvaria/runner-claude';",
      'may not import @elvaria/runner-claude',
    ],
    [
      'apps/world/src/main.ts',
      "import { q } from '@elvaria/store/quests';",
      'world may not import @elvaria/store',
    ],
    ['packages/eventlog/src/log.ts', "import { x } from '@elvaria/nope';", 'Unknown workspace'],
    [
      'packages/store/src/read.ts',
      "import { x } from '@elvaria/domain/src/quest';",
      'through its package exports',
    ],
    [
      'packages/store/src/read.ts',
      "import { W } from '@elvaria/config/boundaries';",
      'may not import @elvaria/config',
    ],
  ])('%s: %s is an error', (file, code, message) => {
    expect(lint(file, code).join('\n')).toContain(message);
  });

  it.each([
    [
      'packages/store/src/read.ts',
      "import { x } from '@elvaria/domain'; import { y } from '@elvaria/eventlog';",
    ],
    ['apps/cli/src/main.ts', "import { claude } from '@elvaria/runner-claude';"],
    ['apps/world/src/main.ts', "import type { WorldState } from '@elvaria/domain';"],
    ['packages/domain/src/quest.ts', "import { z } from 'zod'; import { a } from './a.js';"],
    ['packages/store/vitest.config.ts', "import { preset } from '@elvaria/config/vitest';"],
  ])('%s: %s is allowed', (file, code) => {
    expect(lint(file, code)).toEqual([]);
  });
});

describe('the domain has no IO (ADR 0002)', () => {
  it.each([
    "import { readFile } from 'node:fs';",
    "import { join } from 'path';",
    "import { readFile } from 'fs/promises';",
    "import { test } from 'node:test';",
  ])('rejects the built-in in %s', (code) => {
    expect(lint('packages/domain/src/quest.ts', code).join('\n')).toContain('domain has no IO');
  });

  it.each([
    ['Date.now();', 'injected Clock'],
    ['new Date();', 'injected Clock'],
    ['setTimeout(() => undefined, 1);', 'injected Clock'],
    ['Math.random();', 'injected IdSource'],
    ['process.env.HOME;', 'pass what you need in'],
  ])('rejects %s', (code, message) => {
    expect(lint('packages/domain/src/quest.ts', code).join('\n')).toContain(message);
  });

  it('accepts a date built from data', () => {
    expect(lint('packages/domain/src/quest.ts', "new Date('2026-11-06T00:00:00Z');")).toEqual([]);
  });

  it('lets tests read fixtures and the clock', () => {
    const code = "import { readFileSync } from 'node:fs'; Date.now();";
    expect(lint('packages/domain/src/quest.spec.ts', code)).toEqual([]);
  });
});

describe('hooks start fast', () => {
  it('rejects anything beyond node:fs, node:path, node:process and the event log', () => {
    for (const code of ["import { spawn } from 'node:child_process';", "import { z } from 'zod';"]) {
      expect(lint('packages/hooks/elvaria-hook.mjs', code).join('\n')).toContain('hooks may load only');
    }
  });

  it('accepts what the hook needs, and lets its tests load vitest', () => {
    const code = [
      "import { appendFileSync } from 'node:fs';",
      "import { append } from '@elvaria/eventlog';",
      "import { parse } from './parse.mjs';",
    ].join('\n');
    expect(lint('packages/hooks/elvaria-hook.mjs', code)).toEqual([]);
    expect(lint('packages/hooks/src/hook.spec.ts', "import { it } from 'vitest';")).toEqual([]);
  });
});

describe('restrictedImportPatterns', () => {
  it('only the runtime list forbids dev-only workspaces', () => {
    const messages = (runtime: boolean) =>
      restrictedImportPatterns('store', { runtime }).map((pattern) => pattern.message);
    expect(messages(true).join('\n')).toContain('@elvaria/config');
    expect(messages(false).join('\n')).not.toContain('@elvaria/config');
  });
});

describe('elvaria() composes the rules in the right order', () => {
  const eslint = new ESLint({ cwd: REPO, overrideConfigFile: true, overrideConfig: elvaria({ root: REPO }) });
  /** The rule entry that applies to `file`, serialized for a substring check. */
  const ruleFor = async (file: string, rule: string): Promise<string> => {
    // calculateConfigForFile is typed `any`; the shape is ESLint's own Linter.Config.
    const config = (await eslint.calculateConfigForFile(join(REPO, file))) as Linter.Config;
    return JSON.stringify(config.rules?.[rule] ?? 'unset');
  };

  it('keeps the enum and class bans in the domain next to the clock ban', async () => {
    const syntax = await ruleFor('packages/domain/src/quest.ts', 'no-restricted-syntax');
    expect(syntax).toContain('TSEnumDeclaration');
    expect(syntax).toContain('ClassDeclaration');
    expect(syntax).toContain("property.name='now'");
  });

  it('allows classes in runner adapters only', async () => {
    expect(await ruleFor('packages/runner-claude/src/runner.ts', 'no-restricted-syntax')).not.toContain(
      'Class',
    );
    expect(await ruleFor('packages/steward/src/tick.ts', 'no-restricted-syntax')).toContain('Class');
  });

  it('applies the runtime import list to the hook script outside src/', async () => {
    expect(await ruleFor('packages/hooks/elvaria-hook.mjs', 'no-restricted-imports')).toContain('hooks may');
  });

  it('names numbers in the domain, except in constants.ts and tests', async () => {
    expect(await ruleFor('packages/domain/src/mana.ts', '@typescript-eslint/no-magic-numbers')).toContain(
      '2',
    );
    for (const file of ['packages/domain/src/constants.ts', 'packages/domain/src/mana.spec.ts']) {
      expect(await ruleFor(file, '@typescript-eslint/no-magic-numbers')).toBe('"unset"');
    }
  });

  it('relaxes function length in tests and default exports in tool config', async () => {
    // Overriding only the severity keeps earlier options ([0, 60]); the first element is what counts.
    const severity = async (file: string, rule: string) => (await ruleFor(file, rule)).slice(0, 2);
    expect(await severity('packages/domain/src/mana.spec.ts', 'max-lines-per-function')).toBe('[0');
    expect(await severity('packages/domain/src/mana.ts', 'max-lines-per-function')).toBe('[2');
    expect(await severity('packages/domain/vitest.config.ts', 'import-x/no-default-export')).toBe('[0');
    expect(await severity('packages/domain/src/mana.ts', 'import-x/no-default-export')).toBe('[2');
  });

  it('ignores the design handoff and docs', async () => {
    expect(await eslint.isPathIgnored(join(REPO, 'design/project/app.js'))).toBe(true);
    expect(await eslint.isPathIgnored(join(REPO, 'packages/domain/src/quest.ts'))).toBe(false);
  });
});
