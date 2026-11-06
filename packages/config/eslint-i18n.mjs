// What the CLI prints reaches the owner, so it goes through t() in both locales (ADR 0014, implementation-plan
// §4.1). `i18next/no-literal-string` flags a string literal in apps/cli that could be prose; the browser apps
// (world, lite) get the same rule in its JSX mode when they exist.
import i18next from 'eslint-plugin-i18next';

import { NOT_RUNTIME } from './eslint-boundaries.mjs';

/** Shipped CLI code; tests may print whatever they check. */
export const CLI_OUTPUT_FILES = ['apps/cli/src/**/*.ts'];

/**
 * Literals that are not prose. Prose has a space, a capital or a diacritic; ids, flags, file names, git
 * arguments and kingdom paths have none, so they never need a translation (`git`, `rev-parse`, `--version`,
 * `utf8`, `.cmd`, `inbox/done`). The first two patterns are the plugin's defaults.
 */
export const NOT_PROSE = [
  '[0-9!-/:-@[-`{-~]+',
  '[A-Z_-]+',
  '[-.]*[a-z0-9][a-z0-9._:/@=<>+-]*',
  // Marks and separators only (✓ ✗ · —), which read the same in every locale.
  /^[\p{S}\p{P}\s]+$/u,
];

/** @returns {import('eslint').Linter.Config} */
export function cliOutputConfig() {
  return {
    name: 'elvaria/cli-output',
    files: CLI_OUTPUT_FILES,
    ignores: NOT_RUNTIME,
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          // The CLI has no JSX: every literal counts. Literals TypeScript types as a string-literal union
          // (option specs, status ids), comparisons and UPPER_CASE constants are skipped by the rule itself.
          mode: 'all',
          words: { exclude: NOT_PROSE },
          callees: { exclude: ['t', 'translate', 'Error', 'RegExp'] },
          message: 'Text the owner reads goes through t() with a key in vi.json and en.json (ADR 0014)',
        },
      ],
    },
  };
}
