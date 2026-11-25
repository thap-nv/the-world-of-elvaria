// The check stamp (fix/pre-push-stamp, owner's settlement (246)): `pnpm check` runs everything the pre-push hook's
// `pnpm check:fast` runs, and more, so a push of the very commit a green `pnpm check` just passed on a clean tree
// need not wait minutes for a subset of it again. The hook stays the only automatic gate (CI runs by hand,
// implementation-plan §7): any doubt runs check:fast as before.
//
//   node scripts/check-stamp.mjs start    first step of `pnpm check`: forget the last stamp, note HEAD if clean
//   node scripts/check-stamp.mjs write    last step of `pnpm check`: stamp HEAD if nothing moved since `start`
//   node scripts/check-stamp.mjs verify   .husky/pre-push, reads the hook's stdin: exit 0 = skip check:fast
//
// Two more words count (RC-01, docs/plans/recheck.md §2.4). A green default `pnpm check:changed` on a clean tree
// stamps `changed <head>`, which vouches for a push to any branch but main: a push is not a merge, and the gate is
// whoever merges (the Steward's queue run, or `pnpm check` before a merge by hand). And the Steward's own push of a
// commit its checks passed on names that commit in ELVARIA_CHECKED_HEAD (RC-02), which counts for the branches only
// the Steward pushes.
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
/** The narrow stamp's word: `changed <head>` (RC-01). */
const NARROW = 'changed';
/** Set by the Steward on its `git push` of a commit its checks passed on (RC-02, ADR 0035); guard-bash refuses it. */
export const CHECKED_HEAD = 'ELVARIA_CHECKED_HEAD';
/** Branches only the Steward pushes, so its word opens nothing to a session, which pushes feat/, fix/, docs/. */
const STEWARD_REF = /^refs\/heads\/(?:quest|train)\//;
const MAIN_REF = 'refs/heads/main';
/** A local or remote sha of all zeros: the ref does not exist on that side (a push that deletes a branch). */
const NO_OBJECT = /^0+$/;
const OBJECT_ID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

/** @typedef {{ head: string; clean: boolean; stamp: string | undefined }} Worktree */
/** @typedef {{ skip: boolean; reason: string }} Verdict */
/** @typedef {{ ref: string; sha: string; target: string }} Pushed */

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
 * line, githooks(5)), the remote ref as `target`; a line that does not read so makes the whole input unreadable.
 * @param {string} input
 * @returns {Pushed[] | undefined}
 */
export function pushedRefs(input) {
  const lines = input.split('\n').filter((line) => line.trim() !== '');
  /** @type {Pushed[]} */
  const pushed = [];
  for (const line of lines) {
    const fields = line.trim().split(' ');
    if (fields.length !== 4 || !OBJECT_ID.test(fields[1] ?? '') || !OBJECT_ID.test(fields[3] ?? '')) {
      return undefined;
    }
    // A deleted branch pushes no commit: check:fast would test the working tree, which is not what is deleted.
    if (!NO_OBJECT.test(fields[1] ?? ''))
      pushed.push({ ref: fields[0] ?? '', sha: fields[1] ?? '', target: fields[2] ?? '' });
  }
  return pushed;
}

/**
 * Whether the hook may skip check:fast. The Steward's word (`checkedHead`) covers a push whose every commit is that
 * one and whose every target is a quest or train branch, whatever the worktree holds: the Steward checked the commit.
 * Otherwise every commit the push sends must be HEAD, on a clean tree, and the stamp must name HEAD: the full stamp
 * of `pnpm check` for any push, the narrow one of `pnpm check:changed` for a push that does not update main. A push
 * that sends no commit (only deletions, or nothing to update) has nothing to check.
 * @param {string} input the hook's stdin
 * @param {() => Worktree} worktree read only when the push sends a commit the Steward's word does not cover
 * @param {string} [checkedHead] the hook's ELVARIA_CHECKED_HEAD
 * @returns {Verdict}
 */
export function verdictOf(input, worktree, checkedHead) {
  const pushed = pushedRefs(input);
  if (pushed === undefined) return { skip: false, reason: 'the hook input does not read as git push lines' };
  if (pushed.length === 0) return { skip: true, reason: 'the push sends no commit (only branch deletions)' };
  if (checkedHead && pushed.every((entry) => entry.sha === checkedHead && STEWARD_REF.test(entry.target))) {
    return { skip: true, reason: `the Steward's checks passed on ${checkedHead} (${CHECKED_HEAD})` };
  }
  return stampVerdict(pushed, worktree());
}

/**
 * @param {Pushed[]} pushed at least one commit
 * @param {Worktree} worktree
 * @returns {Verdict}
 */
function stampVerdict(pushed, { head, clean, stamp }) {
  const narrow = stamp?.startsWith(`${NARROW} `) === true;
  const stamped = narrow ? stamp?.slice(NARROW.length + 1) : stamp;
  if (stamped === undefined || stamped.startsWith(PENDING)) {
    return { skip: false, reason: 'no green pnpm check has stamped this worktree' };
  }
  const by = narrow ? 'pnpm check:changed' : 'pnpm check';
  if (stamped !== head)
    return { skip: false, reason: `HEAD ${head} is not the commit ${stamped} ${by} passed on` };
  if (!clean) return { skip: false, reason: `the working tree has changes since ${by} passed` };
  const other = pushed.find((entry) => entry.sha !== head);
  if (other) return { skip: false, reason: `the push sends ${other.ref} at ${other.sha}, not HEAD` };
  if (narrow && pushed.some((entry) => entry.target === MAIN_REF)) {
    return { skip: false, reason: 'the push updates main, which only a green pnpm check vouches for' };
  }
  const where = narrow ? ', and the push does not update main' : '';
  return { skip: true, reason: `${by} passed on HEAD ${head} with a clean tree${where}` };
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

/**
 * The narrow stamp, after a green default `pnpm check:changed` that started on a clean tree and covered every path
 * it changed (check-changed.mjs decides that): `changed <head>` when the tree is still clean at the same HEAD. A full
 * stamp of `pnpm check` for that HEAD says more, so it stays; an older stamp names its own HEAD, so it is harmless.
 * @param {string} cwd
 * @param {Worktree} started `worktreeOf(cwd)` before the checks ran
 */
export function writeNarrow(cwd, started) {
  const { head, clean, stamp } = worktreeOf(cwd);
  if (!started.clean || !clean) return 'check stamp: the working tree has changes, no stamp';
  if (head !== started.head) return 'check stamp: HEAD moved while pnpm check:changed ran, no stamp';
  if (stamp === head) return `check stamp: pnpm check passed on HEAD ${head}, its stamp stays`;
  writeFileSync(stampPath(cwd), `${NARROW} ${head}\n`);
  return `check stamp: pnpm check:changed passed on HEAD ${head}; the pre-push hook skips check:fast for it unless the push updates main`;
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
    return verdictOf(input, () => worktreeOf(cwd), process.env[CHECKED_HEAD]);
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
