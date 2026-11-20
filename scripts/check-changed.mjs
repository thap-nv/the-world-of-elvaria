// `pnpm check:changed` (fix/check-changed, owner's settlement (197)): the checks the "Change impact" table of CLAUDE.md
// asks for the files this branch changed, and only those, so a session can check its work between commits while
// several sessions share one machine. `pnpm check` stays the gate before a merge: this is not a smaller `check`,
// it skips lint, formatting and every package the diff does not reach.
//
//   pnpm check:changed                  diff against the merge-base with origin/main, then run the checks
//   pnpm check:changed --base <ref>     another base (`--base=<ref>` too): a branch, a tag, a sha
//   pnpm check:changed --dry-run        print the paths, the checks and what no rule covers; run nothing
//
// The diff is every tracked file that differs from the merge-base (committed or not) plus the untracked files that
// are not ignored. Checks run one after another and stop at the first failure, as the `&&` chain of `pnpm check` does.
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/** The checkout the script sits in (`scripts/` is one level under it, in a git worktree too). */
const REPO = resolve(import.meta.dirname, '..');

/** What a session that has not named a base compares against. */
export const DEFAULT_BASE = 'origin/main';

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
  { pattern: /^(?:packages|apps)\/([^/]+)\/(?!README\.md$)/, run: [['--filter', '@elvaria/$1', 'test']] },
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
  // the contract and its generated output (ADR 0003)
  { pattern: /^packages\/domain\/src\/schema\/|^docs\/schemas\//, run: [['schemas', '--check']] },
];

/**
 * A command that makes another redundant: `pnpm test` runs the root tests and every package's, `pnpm typecheck` the
 * root program too (package.json).
 * @type {readonly { by: Command; covers: (command: Command) => boolean }[]}
 */
export const SUBSUMES = [
  {
    by: ['test'],
    covers: (c) => (c[0] === '--filter' && c[2] === 'test') || c.join(' ') === 'exec vitest run',
  },
  { by: ['typecheck'], covers: (c) => c.join(' ') === 'exec tsc -p tsconfig.json' },
];

/** Only what git, node and pnpm read from the environment; never process.env whole (CLAUDE.md, ADR 0013). */
const ENV_KEYS = [
  'PATH',
  'Path',
  'PATHEXT',
  'SystemRoot',
  'ComSpec',
  'HOME',
  'USERPROFILE',
  'TEMP',
  'TMP',
  'TMPDIR',
  'APPDATA',
  'LOCALAPPDATA',
  'PNPM_HOME',
  'COREPACK_HOME',
  'CI',
];

/** @param {NodeJS.ProcessEnv} env */
export function toolEnv(env = process.env) {
  return Object.fromEntries(ENV_KEYS.flatMap((key) => (env[key] ? [[key, env[key]]] : [])));
}

/**
 * @param {string[]} argv
 * @returns {{ base: string; dryRun: boolean } | { error: string }}
 */
export function parseArgs(argv) {
  let base = DEFAULT_BASE;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--dry-run') dryRun = true;
    else if (arg.startsWith('--base=')) base = arg.slice('--base='.length);
    else if (arg === '--base') base = argv[++i] ?? '';
    else return { error: `unknown argument ${arg}; usage: check-changed [--base <ref>] [--dry-run]` };
  }
  return base === '' ? { error: '--base needs a ref' } : { base, dryRun };
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
  const all = [...wanted.values()];
  const commands = all.filter((c) => !SUBSUMES.some((s) => wanted.has(s.by.join(' ')) && s.covers(c)));
  return { commands, unmatched };
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
 * @returns {string[]}
 */
export function changedPaths(cwd, base) {
  const mergeBase = git(cwd, ['merge-base', base, 'HEAD']).trim();
  const tracked = git(cwd, ['diff', '--name-only', '--no-renames', '-z', mergeBase]);
  const untracked = git(cwd, ['ls-files', '--others', '--exclude-standard', '-z']);
  const names = `${tracked}\0${untracked}`.split('\0').filter((name) => name !== '');
  return [...new Set(names)].sort();
}

/**
 * How to start `pnpm <command>` without a shell: pnpm is a `.cmd` shim on Windows, which spawn cannot start, so run
 * pnpm's own script with node when `pnpm run` told us where it is (`npm_execpath`).
 * @param {readonly string[]} command
 * @param {NodeJS.ProcessEnv} env
 * @param {string} platform
 * @returns {{ file: string; args: string[] } | { error: string }}
 */
export function pnpmInvocation(command, env, platform) {
  const script = env.npm_execpath;
  if (script && /\.[cm]?js$/.test(script)) return { file: process.execPath, args: [script, ...command] };
  if (script) return { file: script, args: [...command] };
  if (platform === 'win32')
    return { error: 'run it as `pnpm check:changed` (pnpm is a .cmd shim on Windows and no shell is used)' };
  return { file: 'pnpm', args: [...command] };
}

/**
 * @param {string[]} argv
 * @param {string} cwd
 * @param {(line: string) => void} out
 * @returns {number} the exit code
 */
export function main(argv, cwd, out) {
  const args = parseArgs(argv);
  if ('error' in args) {
    out(args.error);
    return 2;
  }
  const paths = changedPaths(cwd, args.base);
  const { commands, unmatched } = plan(paths);
  out(`${paths.length} changed path(s) against the merge-base with ${args.base}`);
  for (const path of unmatched) out(`  no rule for ${path}`);
  if (unmatched.length > 0) out('  (lint, formatting and root configuration are left to `pnpm check`)');
  if (commands.length === 0) {
    out('nothing to check');
    return 0;
  }
  out(`checks:\n${commands.map((c) => `  pnpm ${c.join(' ')}`).join('\n')}`);
  if (args.dryRun) return 0;
  for (const command of commands) {
    const start = pnpmInvocation(command, process.env, process.platform);
    if ('error' in start) {
      out(start.error);
      return 2;
    }
    out(`\n> pnpm ${command.join(' ')}`);
    const run = spawnSync(start.file, start.args, { cwd, env: toolEnv(), stdio: 'inherit', shell: false });
    if (run.status !== 0) {
      out(
        `pnpm ${command.join(' ')} failed (${run.error?.message ?? `exit ${run.status}`}); the checks after it did not run`,
      );
      return run.status ?? 1;
    }
  }
  out('\nchanged-file checks passed; `pnpm check` is still the gate before a merge');
  return 0;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(realpathSync(entry)).href) {
  process.exitCode = main(process.argv.slice(2), REPO, (line) => process.stdout.write(`${line}\n`));
}
