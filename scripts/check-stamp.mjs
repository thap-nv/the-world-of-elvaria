// The check stamp (fix/pre-push-stamp, owner's settlement (246)): `pnpm check` runs everything the pre-push hook's
// `pnpm check:fast` runs, and more, so a push of the very commit a green `pnpm check` just passed on a clean tree
// need not wait minutes for a subset of it again. The hook stays the only automatic gate (CI runs by hand,
// implementation-plan §7): any doubt runs check:fast as before.
//
//   node scripts/check-stamp.mjs start    first step of `pnpm check`: forget the last stamp, note HEAD if clean
//   node scripts/check-stamp.mjs write    last step of `pnpm check`: stamp HEAD if nothing moved since `start`
//   node scripts/check-stamp.mjs verify   .husky/pre-push, reads the hook's stdin: exit 0 = skip check:fast
//
// The stamp is a file in the worktree's own git dir (`git rev-parse --git-path`), so each worktree has its own.
// `start` and `write` both look at the tree because a check reads the working tree, not a commit: a commit or an
// edit made while the check runs (a check left running in the background) leaves no stamp.
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';

/** The stamp's name inside the worktree's git dir. */
export const STAMP_NAME = 'elvaria-check-ok';
const PENDING = 'pending';
/** A local or remote sha of all zeros: the ref does not exist on that side (a push that deletes a branch). */
const NO_OBJECT = /^0+$/;
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/** @typedef {{ head: string; clean: boolean; stamp: string | undefined }} Worktree */
/** @typedef {{ skip: boolean; reason: string }} Verdict */

/** Only what git needs from the environment; never process.env whole (CLAUDE.md, ADR 0013). */
function gitEnv() {
  const keys = ['PATH', 'SystemRoot', 'HOME', 'USERPROFILE'];
  return Object.fromEntries(keys.flatMap((key) => (process.env[key] ? [[key, process.env[key]]] : [])));
}

/**
 * git in `cwd`, found on PATH without a shell (ADR 0015). Without GIT_DIR, which the hook inherits from git: the
 * repo is the worktree the command runs in, as `pnpm check` sees it.
 * @param {string} cwd
 * @param {string[]} args
 */
function git(cwd, args) {
  const run = spawnSync('git', args, { cwd, env: gitEnv(), encoding: 'utf8', shell: false });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} exited ${run.status}: ${run.stderr.trim()}`);
  return run.stdout;
}

/** @param {string} cwd */
export function stampPath(cwd) {
  return resolve(cwd, git(cwd, ['rev-parse', '--git-path', STAMP_NAME]).trim());
}

/**
 * HEAD, whether `git status` shows nothing (untracked files count, whatever `status.showUntrackedFiles` says), and
 * the stamp's text.
 * @param {string} cwd
 * @returns {Worktree}
 */
export function worktreeOf(cwd) {
  const head = git(cwd, ['rev-parse', '--verify', 'HEAD']).trim();
  const clean = git(cwd, ['status', '--porcelain', '--untracked-files=normal']).trim() === '';
  /** @type {string | undefined} */
  let stamp;
  try {
    stamp = readFileSync(stampPath(cwd), 'utf8').trim();
  } catch {
    stamp = undefined;
  }
  return { head, clean, stamp };
}

/**
 * The refs a push updates, from the pre-push hook's stdin (`<local ref> <local sha> <remote ref> <remote sha>` per
 * line, githooks(5)); a line that does not read so makes the whole input unreadable.
 * @param {string} input
 * @returns {{ ref: string; sha: string }[] | undefined}
 */
export function pushedRefs(input) {
  const lines = input.split('\n').filter((line) => line.trim() !== '');
  /** @type {{ ref: string; sha: string }[]} */
  const pushed = [];
  for (const line of lines) {
    const fields = line.trim().split(' ');
    if (fields.length !== 4 || !OBJECT_ID.test(fields[1] ?? '') || !OBJECT_ID.test(fields[3] ?? '')) {
      return undefined;
    }
    // A deleted branch pushes no commit: check:fast would test the working tree, which is not what is deleted.
    if (!NO_OBJECT.test(fields[1] ?? '')) pushed.push({ ref: fields[0] ?? '', sha: fields[1] ?? '' });
  }
  return pushed;
}

/**
 * Whether the hook may skip check:fast: every commit the push sends is HEAD, and the stamp says `pnpm check` passed
 * on HEAD with this clean tree. A push that sends no commit (only deletions, or nothing to update) has nothing to
 * check.
 * @param {string} input the hook's stdin
 * @param {() => Worktree} worktree read only when the push sends a commit
 * @returns {Verdict}
 */
export function verdictOf(input, worktree) {
  const pushed = pushedRefs(input);
  if (pushed === undefined) return { skip: false, reason: 'the hook input does not read as git push lines' };
  if (pushed.length === 0) return { skip: true, reason: 'the push sends no commit (only branch deletions)' };
  const { head, clean, stamp } = worktree();
  if (stamp === undefined || stamp.startsWith(PENDING)) {
    return { skip: false, reason: 'no green pnpm check has stamped this worktree' };
  }
  if (stamp !== head) {
    return { skip: false, reason: `HEAD ${head} is not the commit ${stamp} pnpm check passed on` };
  }
  if (!clean) return { skip: false, reason: 'the working tree has changes since pnpm check passed' };
  const other = pushed.find((entry) => entry.sha !== head);
  if (other) return { skip: false, reason: `the push sends ${other.ref} at ${other.sha}, not HEAD` };
  return { skip: true, reason: `pnpm check passed on HEAD ${head} with a clean tree` };
}

/** @param {string} cwd */
export function start(cwd) {
  const path = stampPath(cwd);
  rmSync(path, { force: true });
  const { head, clean } = worktreeOf(cwd);
  if (clean) writeFileSync(path, `${PENDING} ${head}\n`);
  return clean
    ? `check stamp: pnpm check starts on HEAD ${head}`
    : 'check stamp: the working tree has changes, no stamp';
}

/** @param {string} cwd */
export function write(cwd) {
  const path = stampPath(cwd);
  const { head, clean, stamp } = worktreeOf(cwd);
  if (clean && stamp === `${PENDING} ${head}`) {
    writeFileSync(path, `${head}\n`);
    return `check stamp: pnpm check passed on HEAD ${head} (${path}); the pre-push hook skips check:fast for it`;
  }
  rmSync(path, { force: true });
  return clean
    ? 'check stamp: HEAD or the working tree moved while pnpm check ran, no stamp'
    : 'check stamp: the working tree has changes, no stamp';
}

/** Everything on stdin: a stream read waits for git to close the pipe (a sync read of fd 0 can stop at EAGAIN). */
async function readInput() {
  /** @type {Buffer[]} */
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * The verdict on a push; a git that fails (no HEAD yet, not a repo) runs check:fast rather than stop the push.
 * @param {string} input
 * @param {string} cwd
 * @returns {Verdict}
 */
function verifyInput(input, cwd) {
  try {
    return verdictOf(input, () => worktreeOf(cwd));
  } catch (error) {
    return { skip: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * @param {string} mode
 * @param {string} cwd
 * @returns {Promise<number>} the exit code: for `verify`, 0 lets the hook skip check:fast
 */
export async function main(mode, cwd) {
  if (mode === 'start' || mode === 'write') {
    console.log(mode === 'start' ? start(cwd) : write(cwd));
    return 0;
  }
  if (mode === 'verify') {
    const verdict = verifyInput(await readInput(), cwd);
    const next = verdict.skip ? 'skipping pnpm check:fast' : 'running pnpm check:fast';
    console.error(`pre-push: ${verdict.reason}; ${next}`);
    return verdict.skip ? 0 : 1;
  }
  console.error('usage: node scripts/check-stamp.mjs start|write|verify');
  return 2;
}

if (import.meta.main) {
  process.exitCode = await main(process.argv[2] ?? '', process.cwd());
}
