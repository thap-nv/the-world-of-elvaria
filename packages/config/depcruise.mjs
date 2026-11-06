// dependency-cruiser rules built from boundaries.mjs (implementation-plan §1.4, layer 3). The last gate:
// it sees the whole graph, so it also catches what ESLint cannot (dynamic imports, require, cycles).
import { DEV_ONLY, WORKSPACES, forbiddenFor, workspaceDir } from './boundaries.mjs';

/** @typedef {import('dependency-cruiser').IConfiguration} Configuration */
/** @typedef {import('dependency-cruiser').IForbiddenRuleType} Rule */

const SEE_PLAN = 'see docs/implementation-plan.md §1.3';
const WORKSPACE = '^(packages|apps)/([^/]+)/';
/** Tests, fixtures and tool config are not shipped; mirrors NOT_RUNTIME in eslint-boundaries.mjs. */
const NOT_RUNTIME = String.raw`\.spec\.ts$|/__fixtures__/|\.config\.(ts|mjs)$`;

/** @param {readonly string[]} keys */
const dirsRegex = (keys) => `^(${keys.map(workspaceDir).join('|')})/`;

/** @returns {Rule[]} one rule per workspace: it may reach only the workspaces boundaries.mjs lists */
function boundaryRules() {
  return Object.keys(WORKSPACES).map((key) => {
    const deps = WORKSPACES[key]?.deps ?? [];
    return {
      name: `boundary-${key}`,
      comment: `${key} may import only: ${deps.join(', ') || 'no other workspace'}; ${SEE_PLAN}.`,
      severity: 'error',
      from: { path: `^${workspaceDir(key)}/` },
      to: { path: dirsRegex(forbiddenFor(key).filter((other) => !DEV_ONLY.includes(other))) },
    };
  });
}

/** @returns {Rule[]} */
function graphRules() {
  return [
    {
      name: 'no-circular',
      comment: 'A cycle makes two modules one; split the shared part out (implementation-plan §1.4 a).',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      comment:
        'Unresolvable import: a typo, an undeclared dependency, or a deep import past a package\'s "exports" (§1.4 c).',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'not-in-package-json',
      comment: "Declare every imported package in the importing workspace's own package.json (§1.4 b).",
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'no-dev-dependency-at-runtime',
      comment: 'Shipped code may not import a devDependency; move it to dependencies (§1.4 b).',
      severity: 'error',
      from: { path: WORKSPACE, pathNot: NOT_RUNTIME },
      to: { dependencyTypes: ['npm-dev'] },
    },
    {
      name: 'no-relative-import-across-workspaces',
      comment: 'Reach another workspace by its package name, so boundaries and "exports" apply (§1.4).',
      severity: 'error',
      from: { path: WORKSPACE },
      to: { dependencyTypes: ['local'], path: '^(packages|apps)/', pathNot: '^$1/$2/' },
    },
  ];
}

/** @returns {Rule[]} */
function runtimeRules() {
  return [
    {
      name: 'dev-only-workspace-at-runtime',
      comment: `${DEV_ONLY.join(', ')} is dev-only: config files may use it, shipped code may not; ${SEE_PLAN}.`,
      severity: 'error',
      from: { path: WORKSPACE, pathNot: [NOT_RUNTIME, dirsRegex(DEV_ONLY)] },
      to: { path: dirsRegex(DEV_ONLY) },
    },
    {
      name: 'domain-no-io',
      comment: 'domain has no IO: no Node built-ins; inject Clock and IdSource instead (ADR 0002).',
      severity: 'error',
      from: { path: `^${workspaceDir('domain')}/`, pathNot: NOT_RUNTIME },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'hooks-fast-start',
      comment:
        'hooks may load only node:fs, node:path, node:process and @elvaria/eventlog, to start in < 100 ms (§1.4).',
      severity: 'error',
      from: { path: `^${workspaceDir('hooks')}/`, pathNot: NOT_RUNTIME },
      to: {
        dependencyTypesNot: ['local'],
        pathNot: [String.raw`^(node:)?(fs|path|process)$`, `^${workspaceDir('eventlog')}/`],
      },
    },
  ];
}

/** @returns {Configuration} */
export function depcruiseConfig() {
  return {
    forbidden: [...graphRules(), ...boundaryRules(), ...runtimeRules()],
    options: {
      // An excluded module disappears together with every import of it, so `exclude` must never match an
      // npm package (most resolve into their own dist/); otherwise the package.json rules see nothing.
      doNotFollow: { path: '(^|/)node_modules/' },
      exclude: { path: '^(packages|apps)/[^/]+/(dist|coverage)/|(^|/)__fixtures__/' },
      moduleSystems: ['es6', 'cjs'],
      // A type-only import still couples two packages.
      tsPreCompilationDeps: true,
      skipAnalysisNotInRules: true,
      enhancedResolveOptions: {
        exportsFields: ['exports'],
        conditionNames: ['import', 'require', 'node', 'default', 'types'],
        mainFields: ['module', 'main', 'types', 'typings'],
        extensions: ['.ts', '.mts', '.mjs', '.js', '.json'],
      },
    },
  };
}
