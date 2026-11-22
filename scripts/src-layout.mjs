// `pnpm layout` (AH-02; plans/architecture-health.md V2, K2): the folder rules of implementation-plan §4.2 that a
// script can see, as a gate over every workspace under packages/ and apps/.
//
//   pnpm layout           red on a violation layout-baseline.json does not hold, and on an entry it holds above today
//   pnpm layout --prune   lower layout-baseline.json to today: drop what was fixed, lower counts; never adds or raises
//
// R2 root_size: a src/ root holds at most 20 runtime files, 10 once the package has more than 40.
// R2 dir_size: any other folder holds at most 30 runtime files directly, its index.ts barrel (R5) aside.
// R3 root_spec: in a package of more than 40 runtime files, a spec at the src/ root sits next to its runtime file.
// R4 test_dir: test helpers live in src/**/__fixtures__/ or <package>/fixtures/, never in a test/ folder.
// R6 name_pair: one folder never holds a singular and a plural name (notice.ts and notices.ts).
//
// The baseline only shrinks, like eslint-suppressions.json: the cleanup tasks (AH-05, AH-06, AH-08, AH-12) lower it
// with --prune, and src-layout.spec.ts fails a branch whose baseline grew since it left main.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const BASELINE_FILE = 'layout-baseline.json';
export const ROOT_LIMIT = 20;
export const BIG_ROOT_LIMIT = 10;
export const BIG_PACKAGE = 40;
export const DIR_LIMIT = 30;

/** @typedef {'root_size' | 'dir_size' | 'root_spec' | 'test_dir' | 'name_pair'} LayoutRule */
/** Rule → where (a folder or a file, repo-relative, `/`) → how many: a file count, or 1. */
/** @typedef {Record<LayoutRule, Record<string, number>>} Violations */
/** @typedef {{ version: 1 } & Violations} Baseline */

/** @type {readonly LayoutRule[]} */
export const RULES = ['root_size', 'dir_size', 'root_spec', 'test_dir', 'name_pair'];

const WORKSPACE_PARENTS = ['packages', 'apps'];
// Build output, installs and coverage are not source; fixture trees may hold any layout they test.
const SKIPPED = new Set(['node_modules', 'dist', 'coverage', '.turbo']);
const CODE = /\.(?:ts|tsx|mts|mjs|js)$/;
const SPEC = /\.(?:spec|test)\.[^.]+$/;
const HELPERS = /(?:^|\/)(?:__fixtures__|fixtures)\//;

/** @returns {Violations} */
const emptyViolations = () => ({ root_size: {}, dir_size: {}, root_spec: {}, test_dir: {}, name_pair: {} });

/** @param {string} path */
const dirOf = (path) => path.slice(0, Math.max(0, path.lastIndexOf('/')));
/** @param {string} path */
const nameOf = (path) => path.slice(path.lastIndexOf('/') + 1);
/** @param {string} name */
const stemOf = (name) => name.replace(CODE, '');

/**
 * Runtime files of one workspace's src/: code that is neither a spec nor a test helper.
 * @param {readonly string[]} files  paths under the workspace's src/
 */
const runtimeOf = (files) => files.filter((f) => CODE.test(f) && !SPEC.test(f) && !HELPERS.test(f));

/**
 * The plural spellings R6 looks for next to a singular stem.
 * @param {string} stem
 */
const pluralsOf = (stem) => [
  `${stem}s`,
  `${stem}es`,
  ...(stem.endsWith('y') ? [`${stem.slice(0, -1)}ies`] : []),
];

/**
 * Today's violations of one workspace.
 * @param {string} workspace  e.g. `packages/steward`
 * @param {readonly string[]} files  every file of the workspace, repo-relative, `/` separated
 * @param {Violations} out
 */
function workspaceViolations(workspace, files, out) {
  const src = `${workspace}/src`;
  const runtime = runtimeOf(files.filter((f) => f.startsWith(`${src}/`)));
  /** @type {Map<string, string[]>} */
  const byDir = new Map();
  for (const file of runtime) byDir.set(dirOf(file), [...(byDir.get(dirOf(file)) ?? []), file]);
  const big = runtime.length > BIG_PACKAGE;
  for (const [dir, inDir] of byDir) {
    const limit = dir === src ? (big ? BIG_ROOT_LIMIT : ROOT_LIMIT) : DIR_LIMIT;
    // R5 gives every concept folder an index.ts of re-exports only: it adds no concept, so it fills no folder (AH-03).
    const counted = dir === src ? inDir : inDir.filter((f) => nameOf(f) !== 'index.ts');
    if (counted.length > limit) out[dir === src ? 'root_size' : 'dir_size'][dir] = counted.length;
    namePairsOf(dir, inDir, out);
  }
  const rootStems = new Set((byDir.get(src) ?? []).map((f) => stemOf(nameOf(f))));
  const rootSpecs = big ? files.filter((f) => dirOf(f) === src && SPEC.test(f)) : [];
  for (const file of rootSpecs) if (!rootStems.has(nameOf(file).replace(SPEC, ''))) out.root_spec[file] = 1;
  for (const dir of new Set(files.map(dirOf)))
    if (dir !== workspace) testDirOf(workspace, dir.slice(workspace.length + 1).split('/'), out);
}

/**
 * R6 for the runtime files `inDir` of the folder `dir`.
 * @param {string} dir
 * @param {readonly string[]} inDir
 * @param {Violations} out
 */
function namePairsOf(dir, inDir, out) {
  const stems = new Set(inDir.map((f) => stemOf(nameOf(f))));
  for (const stem of stems)
    for (const plural of pluralsOf(stem))
      if (stems.has(plural)) out.name_pair[`${dir}/${stem} + ${plural}`] = 1;
}

/**
 * R4 for the folder `parts` of `workspace`: a `test` folder on its path, unless a fixture tree holds it (a fixture
 * repo may hold any layout it tests).
 * @param {string} workspace
 * @param {readonly string[]} parts
 * @param {Violations} out
 */
function testDirOf(workspace, parts, out) {
  const at = parts.indexOf('test');
  const helpers = parts.findIndex((part) => part === '__fixtures__' || part === 'fixtures');
  if (at >= 0 && (helpers < 0 || at < helpers))
    out.test_dir[[workspace, ...parts.slice(0, at + 1)].join('/')] = 1;
}

/**
 * Every violation of the rules in `files`.
 * @param {readonly string[]} files  repo-relative paths under packages/ and apps/, `/` separated
 * @returns {Violations}
 */
export function layoutViolations(files) {
  /** @type {Map<string, string[]>} */
  const byWorkspace = new Map();
  for (const file of files) {
    const [parent, name] = file.split('/');
    if (parent === undefined || name === undefined || !WORKSPACE_PARENTS.includes(parent)) continue;
    const workspace = `${parent}/${name}`;
    byWorkspace.set(workspace, [...(byWorkspace.get(workspace) ?? []), file]);
  }
  const out = emptyViolations();
  for (const [workspace, inWorkspace] of byWorkspace) workspaceViolations(workspace, inWorkspace, out);
  return out;
}

/**
 * What the baseline does not cover (a new entry, or a count above the baseline's), and what it holds above today
 * (an entry fixed or lowered, left for --prune).
 * @param {Violations} baseline
 * @param {Violations} today
 * @returns {{ added: string[]; stale: string[] }}
 */
export function compareLayout(baseline, today) {
  const added = RULES.flatMap((rule) =>
    Object.entries(today[rule]).flatMap(([at, count]) => {
      const allowed = baseline[rule][at];
      if (allowed === undefined) return [`${rule} ${at}${count > 1 ? ` (${count})` : ''}`];
      return count > allowed ? [`${rule} ${at}: ${allowed} → ${count}`] : [];
    }),
  );
  const stale = RULES.flatMap((rule) =>
    Object.entries(baseline[rule]).flatMap(([at, allowed]) => {
      const count = today[rule][at] ?? 0;
      return count < allowed ? [`${rule} ${at}: ${allowed} → ${count}`] : [];
    }),
  );
  return { added, stale };
}

/**
 * The baseline lowered to today: entries fixed leave, counts drop; nothing new comes in.
 * @param {Violations} baseline
 * @param {Violations} today
 * @returns {Baseline}
 */
export function pruneLayout(baseline, today) {
  /** @type {Baseline} */
  const out = { version: 1, ...emptyViolations() };
  for (const rule of RULES)
    for (const [at, allowed] of Object.entries(baseline[rule]).sort(([a], [b]) => (a < b ? -1 : 1))) {
      const count = Math.min(allowed, today[rule][at] ?? 0);
      if (count > 0) out[rule][at] = count;
    }
  return out;
}

/**
 * How `head` grew from `base`: an entry `base` did not hold, or a count above `base`'s. Empty when it only shrank.
 * @param {Violations} base
 * @param {Violations} head
 */
export const baselineGrowth = (base, head) => compareLayout(base, head).added;

/**
 * The baseline in `text`, every rule present; an unknown rule or version is an error, not an empty list.
 * @param {string} text
 * @returns {Baseline}
 */
export function parseBaseline(text) {
  /** @type {Record<string, unknown>} */
  const raw = JSON.parse(text);
  if (raw.version !== 1) throw new Error(`${BASELINE_FILE}: version must be 1`);
  const unknown = Object.keys(raw).filter((key) => key !== 'version' && !RULES.some((rule) => rule === key));
  if (unknown.length > 0) throw new Error(`${BASELINE_FILE}: unknown rules ${unknown.join(', ')}`);
  /** @type {Baseline} */
  const out = { version: 1, ...emptyViolations() };
  for (const rule of RULES) Object.assign(out[rule], raw[rule]);
  return out;
}

/**
 * Every file of every workspace, repo-relative, `/` separated.
 * @param {string} root
 */
export function workspaceFiles(root) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} rel */
  const walk = (rel) => {
    for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
      if (SKIPPED.has(entry.name)) continue;
      const path = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else out.push(path);
    }
  };
  for (const parent of WORKSPACE_PARENTS) if (existsSync(join(root, parent))) walk(parent);
  return out;
}

/**
 * Check, or with --prune lower, the baseline of the repo at `root`.
 * @param {readonly string[]} argv
 * @param {string} root
 * @param {(line: string) => void} print
 * @returns {number} the exit code
 */
export function main(argv, root, print) {
  const prune = argv.includes('--prune');
  const unknown = argv.filter((arg) => arg !== '--prune');
  if (unknown.length > 0) {
    print(`unknown argument ${unknown.join(' ')}; usage: layout [--prune]`);
    return 2;
  }
  const path = join(root, BASELINE_FILE);
  /** @type {Baseline} */
  const baseline = existsSync(path)
    ? parseBaseline(readFileSync(path, 'utf8'))
    : { version: 1, ...emptyViolations() };
  const today = layoutViolations(workspaceFiles(root));
  const { added, stale } = compareLayout(baseline, today);
  if (prune && stale.length > 0)
    writeFileSync(path, `${JSON.stringify(pruneLayout(baseline, today), null, 2)}\n`);
  for (const line of added) print(`new: ${line}`);
  if (!prune) for (const line of stale) print(`fixed, run pnpm layout --prune: ${line}`);
  if (added.length > 0) print('Put the file in its concept folder (implementation-plan §4.2, R1–R8).');
  return added.length > 0 || (!prune && stale.length > 0) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = main(process.argv.slice(2), resolve(import.meta.dirname, '..'), (line) => {
    console.log(line);
  });
