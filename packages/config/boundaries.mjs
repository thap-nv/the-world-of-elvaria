// The one dependency table between @elvaria/* workspaces (docs/implementation-plan.md §1.3, ADR 0001).
// ESLint (eslint-boundaries.mjs), dependency-cruiser (depcruise.mjs) and boundaries.spec.ts all read it,
// so a new edge between packages is a change to this file, reviewed like code.

/** @typedef {'packages' | 'apps'} WorkspaceRoot */
/** @typedef {{ readonly root: WorkspaceRoot; readonly deps: readonly string[] }} Workspace */

/**
 * Every workspace, keyed by its directory name under `packages/` or `apps/`.
 * `deps` lists the @elvaria/* workspaces whose code it may import, runtime or type-only.
 * Workspaces listed before their package exists are already guarded, so the first import is checked.
 * @type {Readonly<Record<string, Workspace>>}
 */
export const WORKSPACES = Object.freeze({
  // Dev-only tooling (tsconfig, ESLint, Prettier, this table); see DEV_ONLY.
  config: { root: 'packages', deps: [] },

  // Work engine. Knows quests, characters, worktrees and CLIs; never the renderer.
  domain: { root: 'packages', deps: [] },
  store: { root: 'packages', deps: ['domain', 'eventlog'] },
  'registry-default': { root: 'packages', deps: ['domain'] },
  'runner-core': { root: 'packages', deps: ['domain', 'store', 'eventlog'] },
  'runner-claude': { root: 'packages', deps: ['runner-core'] },
  'runner-antigravity': { root: 'packages', deps: ['runner-core'] },
  'runner-gemini': { root: 'packages', deps: ['runner-core'] },
  'runner-codex': { root: 'packages', deps: ['runner-core'] },
  // The Steward sees only AgentRunner; apps/cli injects the concrete runners (ADR 0006, 0021).
  steward: { root: 'packages', deps: ['domain', 'store', 'eventlog', 'runner-core'] },
  chancellor: { root: 'packages', deps: ['domain', 'runner-core'] },
  sandbox: { root: 'packages', deps: ['domain', 'eventlog', 'store'] },

  // Event bus. hooks must start in < 100 ms, so it loads nothing but the event log.
  eventlog: { root: 'packages', deps: ['domain'] },
  hooks: { root: 'packages', deps: ['eventlog'] },

  // World. Reads the event log and snapshots, writes commands to inbox/; never calls the work engine.
  // The herald does not import the Steward: single writer (ADR 0005).
  herald: { root: 'packages', deps: ['domain', 'store', 'eventlog', 'sandbox'] },
  i18n: { root: 'packages', deps: [] },
  'ui-kit': { root: 'packages', deps: [] },
  ui: { root: 'packages', deps: ['domain', 'i18n', 'ui-kit'] },
  world: { root: 'apps', deps: ['domain', 'i18n', 'ui-kit', 'ui'] },
  lite: { root: 'apps', deps: ['domain', 'i18n', 'ui-kit', 'ui'] },

  // The only composition root: everything except the browser side.
  cli: {
    root: 'apps',
    deps: [
      'domain',
      'eventlog',
      'store',
      'registry-default',
      'runner-core',
      'runner-claude',
      'runner-antigravity',
      'runner-gemini',
      'runner-codex',
      'hooks',
      'steward',
      'chancellor',
      'sandbox',
      'herald',
      'i18n',
    ],
  },
});

/**
 * Workspaces any other workspace may list in devDependencies and use from config files,
 * but never import from `src/`.
 */
export const DEV_ONLY = Object.freeze(['config']);

/**
 * Workspaces whose code must not see Node (the domain has no IO; the rest also runs in a browser). Their
 * tsconfig extends tsconfig/base.json, and their vitest config is .mjs outside it: Vite's types reference
 * @types/node, so one `vitest.config.ts` in the program would make `process` type-check everywhere.
 */
export const NO_NODE_TYPES = Object.freeze(['domain', 'i18n', 'ui-kit', 'ui', 'world', 'lite']);

/** Every workspace's npm name is `@elvaria/<key>`; apps/cli ships the `elvaria` bin. */
export const SCOPE = '@elvaria';

/** @param {string} key */
export function packageName(key) {
  return `${SCOPE}/${key}`;
}

/** @param {string} key */
export function workspaceDir(key) {
  const workspace = WORKSPACES[key];
  if (workspace === undefined) throw new Error(`Unknown workspace "${key}"; add it to boundaries.mjs`);
  return `${workspace.root}/${key}`;
}

/** Keys of the workspaces `key` must not import: everything except itself and its deps. */
export function forbiddenFor(/** @type {string} */ key) {
  const allowed = new Set([key, ...(WORKSPACES[key]?.deps ?? [])]);
  return Object.keys(WORKSPACES).filter((other) => !allowed.has(other));
}
