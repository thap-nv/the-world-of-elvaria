// Turns boundaries.mjs into ESLint rules (implementation-plan §1.4, layer 2): instant feedback in the editor.
// dependency-cruiser (depcruise.mjs) checks the same table over the whole graph and is the last gate.
import { builtinModules } from 'node:module';

import { DEV_ONLY, SCOPE, WORKSPACES, forbiddenFor, workspaceDir } from './boundaries.mjs';

/** @typedef {import('eslint').Linter.Config} Config */
/** @typedef {{ regex: string; message: string }} RegexPattern */

const SEE_PLAN = 'see docs/implementation-plan.md §1.3';

/**
 * Tests, fixtures and tool config are not shipped: they may read files (domain), load vitest (hooks)
 * or use the dev-only config package. Everything else in a workspace is runtime, wherever it sits
 * (`src/`, `scripts/`, `packages/hooks/elvaria-hook.mjs`). Mirrored in depcruise.mjs.
 */
export const NOT_RUNTIME = ['**/*.spec.ts', '**/__fixtures__/**', '**/*.config.{ts,mjs}'];

/** @param {string} text */
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const scope = escapeRegex(SCOPE);

/** Node built-ins under both spellings (`fs`, `node:fs`) and their subpaths (`fs/promises`). */
const nodeBuiltinRegex = (() => {
  const names = builtinModules.map((name) => escapeRegex(name.replace(/^node:/, '')));
  return `^(node:.*|(${names.join('|')})(/.*)?)$`;
})();

/**
 * Extra limits on the runtime source of two workspaces (implementation-plan §1.4).
 * @param {string} key
 * @returns {RegexPattern[]}
 */
function runtimeOnlyPatterns(key) {
  if (key === 'domain') {
    return [
      {
        regex: nodeBuiltinRegex,
        message: 'domain has no IO: no Node built-ins. Inject what you need (Clock, IdSource; ADR 0002).',
      },
    ];
  }
  if (key === 'hooks') {
    return [
      {
        regex: `^(?!node:(fs|path|process)$|${scope}/eventlog$|\\.\\.?/)`,
        message: `hooks may load only node:fs, node:path, node:process and ${SCOPE}/eventlog, to start in < 100 ms (implementation-plan §1.4).`,
      },
    ];
  }
  return [];
}

/**
 * Import restrictions for one workspace.
 * @param {string} key workspace key in boundaries.mjs
 * @param {{ runtime: boolean }} where runtime source (see NOT_RUNTIME) is stricter: no dev-only workspaces,
 *   plus the domain and hooks limits
 * @returns {RegexPattern[]}
 */
export function restrictedImportPatterns(key, { runtime }) {
  const forbidden = forbiddenFor(key).filter((other) => runtime || !DEV_ONLY.includes(other));
  const known = Object.keys(WORKSPACES).map(escapeRegex).join('|');
  return [
    ...forbidden.map((other) => ({
      regex: `^${scope}/${escapeRegex(other)}(/.*)?$`,
      message: `${key} may not import ${SCOPE}/${other}; ${SEE_PLAN}.`,
    })),
    {
      regex: `^${scope}/(?!(${known})(/|$))`,
      message: `Unknown workspace: add it to packages/config/boundaries.mjs first; ${SEE_PLAN}.`,
    },
    {
      regex: `^${scope}/[^/]+/src(/.*)?$`,
      message: `Import ${SCOPE}/* through its package exports, not its src/ files (implementation-plan §1.4).`,
    },
    ...(runtime ? runtimeOnlyPatterns(key) : []),
  ];
}

/**
 * Two config objects per workspace: the whole directory, then its runtime source (stricter, applied last).
 * ESLint replaces a rule's options instead of merging them, so each object carries the full list.
 * @returns {Config[]}
 */
export function boundaryConfigs() {
  return Object.keys(WORKSPACES).flatMap((key) => {
    const dir = workspaceDir(key);
    return [
      {
        name: `elvaria/boundaries/${key}`,
        files: [`${dir}/**`],
        rules: {
          'no-restricted-imports': ['error', { patterns: restrictedImportPatterns(key, { runtime: false }) }],
        },
      },
      {
        name: `elvaria/boundaries/${key}/runtime`,
        files: [`${dir}/**`],
        ignores: NOT_RUNTIME,
        rules: {
          'no-restricted-imports': ['error', { patterns: restrictedImportPatterns(key, { runtime: true }) }],
        },
      },
    ];
  });
}

const NO_IO = 'domain has no IO (ADR 0002)';

/**
 * Clock, randomness, timers and process state are IO: the domain receives them as `Clock` and `IdSource`,
 * so state machines and selection stay pure functions with deterministic tests.
 * @param {readonly { selector: string; message: string }[]} baseSyntax the repo-wide `no-restricted-syntax`
 *   entries; ESLint would otherwise drop them for the domain, because a later object replaces rule options
 * @returns {Config}
 */
export function pureDomainConfig(baseSyntax) {
  const globalNames = ['process', 'Buffer', 'require', '__dirname', '__filename', 'fetch', 'crypto'];
  const timers = [
    'setTimeout',
    'setInterval',
    'setImmediate',
    'clearTimeout',
    'clearInterval',
    'performance',
  ];
  const clock = `${NO_IO}: read time from an injected Clock.`;
  return {
    name: 'elvaria/domain/no-io',
    files: [`${workspaceDir('domain')}/**`],
    ignores: NOT_RUNTIME,
    rules: {
      'no-restricted-globals': [
        'error',
        ...globalNames.map((name) => ({ name, message: `${NO_IO}: pass what you need in.` })),
        ...timers.map((name) => ({ name, message: clock })),
      ],
      'no-restricted-syntax': [
        'error',
        ...baseSyntax,
        { selector: "MemberExpression[object.name='Date'][property.name='now']", message: clock },
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: clock },
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: `${NO_IO}: take randomness from an injected IdSource.`,
        },
      ],
    },
  };
}
