// PreToolUse hook for Bash and PowerShell, after dc1-se-team's (implementation-plan §5.1): refuses what CLAUDE.md
// forbids, what skips the repo's checks, what rewrites state other worktrees share, and recursive deletes outside
// the checkout and the temp dir. Exit 2 blocks the call and shows stderr to the agent. Claude Code may prefix that
// reason with the hook's command line (spike P1-02); this one holds no secret, so exit 2 is enough. Like dc1's, the
// rules match the whole command line, heredoc bodies included: write files with Edit/Write, not a heredoc.
import { homedir, tmpdir } from 'node:os';
import { resolve, sep, win32 } from 'node:path';
import process from 'node:process';

import { REPO, readPayload, toolInput } from './hook-io.mjs';

/** `git`, then any `-c key=value` / `-C dir` before the subcommand. */
const GIT = String.raw`\bgit(?:\s+-[cC]\s+\S+)*\s+`;
/** End of one command inside a command line. */
const END = String.raw`(?=\s*(?:$|[;&|)\n]))`;
const FIX_THE_CHECK = 'Fix the failing check instead.';

/** @type {readonly (readonly [RegExp, string])[]} */
export const RULES = [
  [
    new RegExp(String.raw`${GIT}push\b[^\n;&|]*(\s--force\b|\s-f\b|--force-with-lease|\s\+\S)`),
    'Force push is not allowed. Push a new commit instead.',
  ],
  [/--no-verify\b/, `Skipping git hooks (--no-verify) is forbidden by CLAUDE.md. ${FIX_THE_CHECK}`],
  [
    /\bHUSKY=0\b|\bcore\.hooksPath\b/,
    `Turning husky off skips the checks as --no-verify does. ${FIX_THE_CHECK}`,
  ],
  [
    new RegExp(
      String.raw`${GIT}(?:rebase\b(?!\s+--(?:abort|quit)\b)|pull\b[^\n;&|]*\s(?:--rebase(?!=false)\b|-r\b))`,
    ),
    'Branches are updated with `git merge origin/main`, never rebased: a rebase changes the commit hashes that ' +
      'the status column of docs/implementation-plan.md §8 records.',
  ],
  [
    new RegExp(String.raw`${GIT}stash(?:\s+(?:pop|clear)\b|(?:\s+drop)?${END})`),
    'The stash is shared by every worktree of this repo (parallel tasks, implementation-plan §8): use a WIP ' +
      'commit, or `git stash push -m <tag>` then `git stash apply <sha>`.',
  ],
  [/--(?:allow-)?dangerously-skip-permissions\b/, 'CLAUDE.md forbids --dangerously-skip-permissions.'],
];

/** @typedef {{ text: string; quoted: boolean }} Word */

/** Shell-like words of a command line; quoted ones keep their spaces and are never flags. @returns {Word[]} */
function wordsOf(/** @type {string} */ line) {
  return [...line.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => ({
    text: m[1] ?? m[2] ?? m[3] ?? '',
    quoted: m[3] === undefined,
  }));
}

/** Short flags of `git commit` that take a value: the rest of the cluster, or the next word, is that value. */
const VALUE_FLAGS = new Set(['m', 'F', 'c', 'C', 't']);

/** The words after `git [-c k=v | -C dir]... commit`, or undefined for any other command. @param {Word[]} words */
function commitArgs(words) {
  let at = words.findIndex((word) => word.text === 'git');
  if (at < 0) return undefined;
  at += 1;
  while (words[at]?.text === '-c' || words[at]?.text === '-C') at += 2;
  return words[at]?.text === 'commit' ? words.slice(at + 1) : undefined;
}

/** True when a short-flag cluster sets `n` before any flag that takes a value. @param {Word[]} args */
function hasShortN(args) {
  let takesValue = false;
  for (const word of args) {
    const isFlags = !takesValue && !word.quoted && /^-[A-Za-z]+$/.test(word.text);
    takesValue = false;
    if (!isFlags) continue;
    const flags = [...word.text.slice(1)];
    const valueAt = flags.findIndex((flag) => VALUE_FLAGS.has(flag));
    if (flags.slice(0, valueAt < 0 ? undefined : valueAt).includes('n')) return true;
    takesValue = valueAt === flags.length - 1;
  }
  return false;
}

/** `git commit -n` is `--no-verify` spelled short, alone or in a cluster such as `-an`. */
export function commitSkipsHooks(/** @type {string} */ command) {
  return command.split(/[;&|\n]+/).some((segment) => {
    const args = commitArgs(wordsOf(segment));
    return args !== undefined && hasShortN(args);
  });
}

// On Windows, Git Bash spells C:\ as /c/. Elsewhere /c/ is a POSIX path, and a drive path (C:\, C:/) resolves the
// Windows way: posix resolve() would treat it as relative and place it inside the repo.
function toFullPath(/** @type {string} */ path, /** @type {string} */ base) {
  if (process.platform === 'win32') return resolve(base, path.replace(/^\/([a-zA-Z])\//, '$1:/'));
  return /^[a-zA-Z]:[\\/]/.test(path) ? win32.resolve(path) : resolve(base, path);
}

const REMOVE = /(?<![\w-])(?:rm|rmdir|rd|del|erase|ri|Remove-Item)\s+([^;&|\n]+)/gi;
const RECURSIVE_FLAG = /^(-[rfidv]*r[rfidv]*|--recursive|-rec(u(r(se?)?)?)?)$/i;
const HOME_PREFIX = /^(~|\$HOME|\$\{HOME\}|\$env:HOME|\$env:USERPROFILE)(?=[\\/]|$)/i;

/**
 * The first target of a recursive delete outside the checkout and the temp dir: rm -r/-R/--recursive, and
 * PowerShell Remove-Item -Recurse under any alias. ~ and $HOME resolve to the home dir, relative paths from the
 * session's cwd; a cd earlier in the same line is not followed.
 * @param {string} command
 * @param {string} cwd
 */
export function deleteOutside(command, cwd) {
  const roots = [REPO, resolve(tmpdir())].map((path) => path.toLowerCase());
  const inside = (/** @type {string} */ full) =>
    roots.some(
      (root) => full === root || full.startsWith(root + sep.toLowerCase()) || full.startsWith(`${root}/`),
    );
  for (const match of command.matchAll(REMOVE)) {
    const args = wordsOf(match[1] ?? '').map((word) => word.text);
    if (!args.some((arg) => RECURSIVE_FLAG.test(arg))) continue;
    const target = args
      .filter((arg) => !arg.startsWith('-'))
      .find((arg) => !inside(toFullPath(arg.replace(HOME_PREFIX, homedir()), cwd).toLowerCase()));
    if (target !== undefined) return target;
  }
  return undefined;
}

/**
 * Why `command` is refused, or undefined when it may run.
 * @param {string} command
 * @param {string} cwd the session's working directory
 */
export function refusalOf(command, cwd = REPO) {
  const rule = RULES.find(([pattern]) => pattern.test(command));
  if (rule !== undefined) return rule[1];
  if (commitSkipsHooks(command))
    return `\`git commit -n\` skips git hooks like --no-verify. ${FIX_THE_CHECK}`;
  const target = deleteOutside(command, toFullPath(cwd, REPO));
  return target === undefined
    ? undefined
    : `recursive delete outside the checkout and the temp dir (${target}).`;
}

if (import.meta.main) {
  const payload = readPayload();
  const cwd = typeof payload.cwd === 'string' && payload.cwd !== '' ? payload.cwd : REPO;
  const reason = refusalOf(toolInput(payload, 'command'), cwd);
  if (reason !== undefined) {
    process.stderr.write(`Blocked by .claude/hooks/guard-bash.mjs: ${reason}\n`);
    process.exitCode = 2;
  }
}
