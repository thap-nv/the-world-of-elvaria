// `pnpm check:changed` (fix/check-changed, owner's settlement (197)): the checks the "Change impact" table of CLAUDE.md
// asks for the files this branch changed, and only those, so a session can check its work between commits while
// several sessions share one machine. `pnpm check` stays the gate before a merge: this is not a smaller `check`,
// by default it skips lint, formatting and every package the diff does not reach. ELVARIA_CHECK_BASE or --only
// enables the territory's narrow mode, including changed-file lint/format; a path no rule covers runs the --only
// group whole, or exits 3 without --only.
//
//   pnpm check:changed                  diff against the merge-base with origin/main, then run the checks
//   pnpm check:changed --base <ref>     another base (`--base=<ref>` too): a branch, a tag, a sha
//   pnpm check:changed --dry-run        print the paths, the checks and what no rule covers; run nothing
//
// The diff is every tracked file that differs from the merge-base (committed or not) plus the untracked files that
// are not ignored. Checks run one after another and stop at the first failure, as the `&&` chain of `pnpm check` does.
// A green default run on a clean tree stamps HEAD for the pre-push hook, for pushes that do not update main (RC-01).
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { commandsOf, GROUPS, HELP, UNCOVERED_EXIT } from './check-changed-narrow.mjs';
import { runCommands, toolEnv } from './check-changed-run.mjs';
import { worktreeOf, writeNarrow } from './check-stamp.mjs';

// Other scripts' specs take the tool env from here, where it was first.
export { toolEnv };

/** The checkout the script sits in (`scripts/` is one level under it, in a git worktree too). */
const REPO = resolve(import.meta.dirname, '..');

/** What a session that has not named a base compares against. */
export const DEFAULT_BASE = 'origin/main';

/**
 * The repo's own root package (package.json `name`). It devDepends on domain, i18n, testkit and config, so
 * `...@elvaria/<pkg>` selects it, and its `test` (`vitest run && pnpm -r test`) ran every package suite a second time
 * beside the filtered run: two Vitest processes on one coverage folder, refused (quest LL-06, 2026-11-26).
 */
export const ROOT_PACKAGE = 'the-world-of-elvaria';

/**
 * Path → checks, the "Change impact" table of CLAUDE.md as data. Every rule whose `pattern` matches a path adds its
 * `run` commands; `$1` in a command is that match's first capture group (the workspace folder, which is also its
 * `@elvaria/<key>` name). A package README is documentation, not code: it asks for `docs:check` only.
 * @typedef {string[]} Command  the root script or tool and its arguments, as typed after `pnpm`
 * @type {readonly { pattern: RegExp; run: readonly Command[] }[]}
 */
export const RULES = [
  // domain: every package imports it, so every package's tests and types are in play (ADR 0001)
  { pattern: /^packages\/domain\/(?!README\.md$)/, run: [['test'], ['typecheck']] },
  // `...` selects the package and every package that depends on it (settlement (382)): a runner-core change once
  // broke apps/cli specs that only the full check ran
  {
    pattern: /^(?:packages|apps)\/([^/]+)\/(?!README\.md$)/,
    run: [
      ['--filter', '...@elvaria/$1', 'test'],
      ['--filter', '...@elvaria/$1', 'typecheck'],
    ],
  },
  // any workspace code: an import cycle inside one package (`no-circular`) moves no manifest, so only a code rule
  // catches it before the merge (CM-04, fixed by 4cfbdb89; settlement (480), R1)
  { pattern: /^(?:packages|apps)\/[^/]+\/(?!README\.md$)/, run: [['boundaries']] },
  // the same table row as the package tests: new package, boundaries.mjs, dependencies, imports between packages
  {
    pattern: /^packages\/config\/boundaries\.mjs$|^(?:packages|apps)\/[^/]+\/package\.json$/,
    run: [['boundaries'], ['docs:gen', '--check']],
  },
  { pattern: /^packages\/i18n\//, run: [['docs:gen', '--check'], ['docs:check'], ['i18n:check']] },
  {
    pattern: /^(?:scripts|\.claude\/hooks)\//,
    run: [
      ['exec', 'vitest', 'run'],
      ['exec', 'tsc', '-p', 'tsconfig.json'],
    ],
  },
  {
    pattern: /^(?:docs\/|CLAUDE\.md$|\.claude\/rules\/|(?:packages|apps)\/[^/]+\/README\.md$)/,
    run: [['docs:check']],
  },
  // a file added, moved or removed in a workspace, and the layout baseline: the folder rules (AH-02, §4.2 R1–R8)
  { pattern: /^(?:packages|apps)\/[^/]+\/(?!README\.md$)|^layout-baseline\.json$/, run: [['layout']] },
  // the contract and its generated output (ADR 0003)
  { pattern: /^packages\/domain\/src\/schema\/|^docs\/schemas\//, run: [['schemas', '--check']] },
  // new, renamed or deleted files (AH-01): any code change, since an edit can leave an export or a file unused too
  {
    pattern:
      /^(?:(?:packages|apps)\/[^/]+\/(?!README\.md$)|scripts\/|\.claude\/hooks\/|knip\.json$|package\.json$)/,
    run: [['knip']],
  },
  // any workspace code, the clone list and the detector (AH-13): an edit can copy a shape as well as add a file
  {
    pattern:
      /^(?:packages|apps)\/[^/]+\/(?!README\.md$)|^shape-clones\.json$|^scripts\/shape-(?:clones|detect)\.mjs$/,
    run: [['dup']],
  },
];

/**
 * A command that makes another redundant: `pnpm test` runs the root tests and every package's, `pnpm typecheck` the
 * root program too (package.json).
 * @type {readonly { by: Command; covers: (command: Command) => boolean }[]}
 */
export const SUBSUMES = [
  {
    by: ['test'],
    covers: (c) => (c[0] === '--filter' && c.at(-1) === 'test') || c.join(' ') === 'exec vitest run',
  },
  {
    by: ['typecheck'],
    covers: (c) =>
      (c[0] === '--filter' && c.at(-1) === 'typecheck') || c.join(' ') === 'exec tsc -p tsconfig.json',
  },
];

/**
 * @param {string[]} argv
 * @returns {{ base: string; dryRun: boolean; only?: string } | { error: string }}
 */
export function parseArgs(argv) {
  let base = DEFAULT_BASE;
  let dryRun = false;
  let only;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('--base=')) base = arg.slice('--base='.length);
    else if (arg === '--base') base = argv[++i] ?? '';
    else if (arg === '--only') only = argv[++i] ?? '';
    else if (arg.startsWith('--only=')) only = arg.slice('--only='.length);
    else return { error: `unknown argument ${arg}; usage: check-changed [--base <ref>] [--dry-run]` };
  }
  if (only !== undefined && !GROUPS.includes(only)) return { error: `unknown group ${only}; ${HELP}` };
  if (base === '') return { error: '--base needs a ref' };
  return { base, dryRun, ...(only === undefined ? {} : { only }) };
}

/**
 * The checks for `paths`, each once, in the order of RULES, minus those another one covers; and the paths no rule
 * covers (lint, formatting and root configuration are left to `pnpm check`).
 * @param {readonly string[]} paths  repo-relative, `/` separated
 * @returns {{ commands: Command[]; unmatched: string[] }}
 */
export function plan(paths) {
  /** @type {Map<string, Command>} */
  const wanted = new Map();
  const unmatched = [];
  for (const path of paths) {
    let hit = false;
    for (const { pattern, run } of RULES) {
      const match = pattern.exec(path);
      if (!match) continue;
      hit = true;
      for (const command of run) {
        const filled = command.map((arg) => arg.replace('$1', match[1] ?? ''));
        wanted.set(filled.join(' '), filled);
      }
    }
    if (!hit) unmatched.push(path);
  }
  const selected = [...wanted.values()];
  const all = ['test', 'typecheck'].reduce((commands, script) => mergeFilters(commands, script), selected);
  const commands = all.filter((c) => !SUBSUMES.some((s) => wanted.has(s.by.join(' ')) && s.covers(c)));
  return { commands, unmatched };
}

/**
 * Each package script as one `pnpm --filter … --filter … <script>`, where the first of them stood: two changed packages
 * often share dependents, and one pnpm run selects each package once. The root package is left out (ROOT_PACKAGE).
 * @param {Command[]} commands
 * @param {string} script
 * @returns {Command[]}
 */
function mergeFilters(commands, script) {
  const isFilter = (/** @type {Command} */ c) => c[0] === '--filter' && c.at(-1) === script;
  const filters = commands.filter(isFilter).flatMap((c) => c.slice(0, -1));
  const at = commands.findIndex(isFilter);
  if (at < 0) return commands;
  const rest = commands.filter((c) => !isFilter(c));
  return [...rest.slice(0, at), [...filters, '--filter', `!${ROOT_PACKAGE}`, script], ...rest.slice(at)];
}

/**
 * git in `cwd` without a shell and without the caller's GIT_* variables (ADR 0015).
 * @param {string} cwd
 * @param {string[]} args
 */
function git(cwd, args) {
  const run = spawnSync('git', args, {
    cwd,
    env: toolEnv(),
    encoding: 'utf8',
    shell: false,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} exited ${run.status}: ${run.stderr.trim()}`);
  return run.stdout;
}

/**
 * Every path that differs from the merge-base of `base` and HEAD, plus untracked files git does not ignore. Renames
 * count as a delete and an add, so both sides name a package.
 * @param {string} cwd
 * @param {string} base
 * @param {string | undefined} exactBase
 * @returns {string[]}
 */
export function changedPaths(cwd, base, exactBase = process.env.ELVARIA_CHECK_BASE) {
  const mergeBase = exactBase || git(cwd, ['merge-base', base, 'HEAD']).trim();
  const tracked = git(cwd, ['diff', '--name-only', '--no-renames', '-z', mergeBase]);
  const untracked = git(cwd, ['ls-files', '--others', '--exclude-standard', '-z']);
  const names = `${tracked}\0${untracked}`.split('\0').filter((name) => name !== '');
  return [...new Set(names)].sort();
}

/**
 * @param {string[]} argv
 * @param {string} cwd
 * @param {(line: string) => void} out
 * @param {Partial<Deps>} [deps] the environment, and what runs the checks
 * @returns {number} the exit code
 */
export function main(argv, cwd, out, deps = {}) {
  if (argv.length === 1 && argv[0] === '--help') {
    out(HELP);
    return 0;
  }
  const args = parseArgs(argv);
  if ('error' in args) {
    out(args.error);
    return 2;
  }
  return checkChanged(args, cwd, out, { env: process.env, run: runCommands, ...deps });
}

/** @typedef {{ env: NodeJS.ProcessEnv; run: typeof runCommands }} Deps */

/**
 * A green default run (no --only, --dry-run, other --base or ELVARIA_CHECK_BASE) that started and ended on a clean
 * tree at one HEAD, with a rule for every path, stamps `changed <head>` for the pre-push hook (RC-01,
 * check-stamp.mjs): what CLAUDE.md asks for each changed file has passed on that commit.
 * @param {{ base: string; dryRun: boolean; only?: string }} args
 * @param {string} cwd
 * @param {(line: string) => void} out
 * @param {Deps} deps
 */
function checkChanged(args, cwd, out, { env, run }) {
  const exactBase = env.ELVARIA_CHECK_BASE;
  const narrow = Boolean(exactBase || args.only);
  const started = narrow || args.dryRun || args.base !== DEFAULT_BASE ? undefined : worktreeOf(cwd);
  // '' and not undefined: undefined would let changedPaths read process.env, not `env`
  const paths = changedPaths(cwd, args.base, exactBase ?? '');
  out(`${paths.length} changed path(s) against ${exactBase || `the merge-base with ${args.base}`}`);
  const planned = plan(paths);
  const commands = commandsOf(planned, paths, cwd, { only: args.only, narrow, out });
  if (commands === undefined) return UNCOVERED_EXIT;
  out(
    commands.length > 0
      ? `checks:\n${commands.map((c) => `  pnpm ${c.join(' ')}`).join('\n')}`
      : 'nothing to check',
  );
  if (args.dryRun) return 0;
  const code = commands.length > 0 ? run(commands, cwd, out, narrow) : 0;
  if (code === 0 && started)
    out(
      planned.unmatched.length > 0
        ? 'check stamp: a path no rule covers, no stamp'
        : writeNarrow(cwd, started),
    );
  return code;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(realpathSync(entry)).href) {
  process.exitCode = main(process.argv.slice(2), REPO, (line) => process.stdout.write(`${line}\n`));
}
