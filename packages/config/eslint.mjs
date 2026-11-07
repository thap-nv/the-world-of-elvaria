// Shared ESLint flat config (implementation-plan §4.2, §7). The root eslint.config.mjs calls elvaria().
// Conventions live here as lint rules, so people and AI agents get the same feedback from the same place.
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import { importX } from 'eslint-plugin-import-x';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import { NOT_RUNTIME, boundaryConfigs, pureDomainConfig } from './eslint-boundaries.mjs';
import { cliOutputConfig } from './eslint-i18n.mjs';

const TESTS = ['**/*.spec.ts'];
// Tools load these through a default export.
const CONFIG_FILES = ['**/*.config.{ts,mjs}', '**/.dependency-cruiser.mjs'];
// Adapters wrap a CLI process and its state; the only place a class reads better than functions (§4.3).
const ADAPTERS = ['packages/runner-*/**'];

const NO_ENUM = {
  selector: 'TSEnumDeclaration',
  message: "Use a union of string literals (type Status = 'open' | 'done'), not an enum (§4.2).",
};
const NO_CLASS = {
  selector: 'ClassDeclaration:not([superClass.name="Error"]), ClassExpression:not([superClass.name="Error"])',
  message: 'Use functions and data types; classes only in runner adapters (§4.3).',
};

/** @typedef {import('eslint').Linter.Config} Config */

// Magic numbers hide decisions; the domain and the Steward name them in constants.ts (§4.2).
/** @type {Config} */
const NAMED_NUMBERS = {
  name: 'elvaria/named-numbers',
  files: ['packages/domain/src/**/*.ts', 'packages/steward/src/**/*.ts'],
  ignores: [...NOT_RUNTIME, '**/constants.ts'],
  rules: {
    '@typescript-eslint/no-magic-numbers': [
      'error',
      {
        // 0n and 1n are the bigint spellings of 0 and 1 (ULID arithmetic in the domain).
        ignore: [0, 1, -1, 100, '0n', '1n'],
        ignoreNumericLiteralTypes: true,
        ignoreTypeIndexes: true,
        ignoreReadonlyClassProperties: true,
      },
    ],
  },
};

/** @type {import('eslint').Linter.RulesRecord} */
const BASE_RULES = {
  eqeqeq: ['error', 'always'],
  'no-console': 'error',
  'no-restricted-syntax': ['error', NO_ENUM, NO_CLASS],
  'max-lines': ['error', 300],
  'max-lines-per-function': ['error', 60],
  'max-depth': ['error', 3],
  'unicorn/filename-case': ['error', { case: 'kebabCase' }],
  'unicorn/prefer-node-protocol': 'error',
  'import-x/no-default-export': 'error',
  'import-x/consistent-type-specifier-style': ['error', 'prefer-top-level'],
  '@typescript-eslint/consistent-type-imports': [
    'error',
    { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
  ],
  '@typescript-eslint/consistent-type-assertions': [
    'error',
    { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' },
  ],
  '@typescript-eslint/naming-convention': ['error', { selector: 'typeLike', format: ['PascalCase'] }],
  '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
};

/** @param {{ root: string }} options root is the directory of the repo's eslint.config.mjs */
export function elvaria({ root }) {
  return defineConfig(
    {
      ignores: [
        '**/node_modules/**',
        '**/dist/**',
        '**/coverage/**',
        '**/__fixtures__/**',
        'design/**',
        'docs/**',
        // Quest worktrees when this repo is a territory (ADR 0012): each is its own checkout, linted there.
        '.elvaria/**',
      ],
    },
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
      name: 'elvaria/base',
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir: root },
        globals: globals.node,
      },
      plugins: { unicorn, 'import-x': importX },
      rules: BASE_RULES,
    },
    { name: 'elvaria/adapters', files: ADAPTERS, rules: { 'no-restricted-syntax': ['error', NO_ENUM] } },
    ...boundaryConfigs(),
    pureDomainConfig([NO_ENUM, NO_CLASS]),
    NAMED_NUMBERS,
    cliOutputConfig(),
    {
      // A suite is one describe callback; its size is bounded by max-lines on the file instead.
      name: 'elvaria/tests',
      files: TESTS,
      rules: {
        'max-lines-per-function': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
      },
    },
    { name: 'elvaria/config-files', files: CONFIG_FILES, rules: { 'import-x/no-default-export': 'off' } },
    // Repo scripts print to the terminal; that is their output.
    { name: 'elvaria/scripts', files: ['scripts/**'], rules: { 'no-console': 'off' } },
    {
      // Plain JS is type-checked by tsc (checkJs) instead; type-aware lint rules need TS sources.
      name: 'elvaria/javascript',
      files: ['**/*.mjs', '**/*.js'],
      extends: [tseslint.configs.disableTypeChecked],
    },
    prettier,
  );
}
