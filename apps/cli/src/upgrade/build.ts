// Making and removing a build (implementation-plan §3.16.4, PS-04b): `git worktree add --detach` of the Elvaria
// repo at one commit into `<kingdom>/.builds/<sha>/`, `pnpm install --frozen-lockfile`, and the build of the hook
// and the event log (`dist/`), the only code that does not run from source. Every program runs without a shell,
// with the minimal env (ADR 0013, 0015) plus HUSKY=0: a build is never a place to commit from.
import { readdir, rm } from 'node:fs/promises';

import { inKingdom } from '@elvaria/store';

import { findExecutable } from '../process/find-executable.ts';
import { launchOf } from '../process/launch.ts';
import { minimalEnv } from '../process/minimal-env.ts';
import { runProcess } from '../process/run-process.ts';
import { BUILDS_DIR, buildDirOf, isCommitSha } from './pointer.ts';
import type { CliIo } from '../io.ts';
import type { Launch } from '../process/launch.ts';
import type { ProcessOutcome } from '../process/run-process.ts';

const MS_PER_MINUTE = 60_000;
const GIT_MINUTES = 5;
const INSTALL_MINUTES = 20;
/** A program that just ended, or the indexer, may hold a file of the build a moment on Windows (P1-39). */
const RM_BUILD = { recursive: true, force: true, maxRetries: 10, retryDelay: 100 } as const;

/** The programs a build needs, found once on PATH. */
export interface Tools {
  readonly git: string;
  readonly pnpm: Launch;
}

/** What `pnpm` runs in a new build, in order: install as the lockfile says, then build the hook. */
export const INSTALL_STEPS: readonly (readonly string[])[] = [
  ['install', '--frozen-lockfile'],
  ['--filter', '@elvaria/hooks', 'build'],
];

/** A step that did not end well: a short reason for the event, and what the program printed. */
export interface StepFailure {
  readonly reason: string;
  readonly output: string;
}

/** git and pnpm, or the name of the one PATH lacks. */
export async function findTools(io: CliIo): Promise<Tools | { readonly missing: string }> {
  const git = await findExecutable('git', io.env, io.platform);
  if (git === undefined) return { missing: 'git' };
  const file = await findExecutable('pnpm', io.env, io.platform);
  const pnpm = file === undefined ? undefined : await launchOf(file, io.nodePath);
  return pnpm === undefined ? { missing: 'pnpm' } : { git, pnpm };
}

export const outputOf = (outcome: ProcessOutcome): string => `${outcome.stdout}${outcome.stderr}`;

/** `exit:<code>`, or `timeout` for a program stopped before it answered: no space, the same in every locale. */
export const reasonOf = (outcome: ProcessOutcome): string =>
  outcome.code === null ? 'timeout' : `exit:${outcome.code}`;

const failureOf = (outcome: ProcessOutcome): StepFailure | undefined =>
  outcome.code === 0 ? undefined : { reason: reasonOf(outcome), output: outputOf(outcome) };

export function gitRun(tools: Tools, io: CliIo) {
  const env = minimalEnv(io.env);
  return (cwd: string, args: readonly string[]): Promise<ProcessOutcome> =>
    runProcess(tools.git, args, { cwd, env, timeoutMs: GIT_MINUTES * MS_PER_MINUTE });
}

/** The commit `ref` names in `source`, or undefined when it names none. */
export async function commitOf(
  tools: Tools,
  io: CliIo,
  source: string,
  ref: string,
): Promise<string | undefined> {
  const outcome = await gitRun(tools, io)(source, [
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${ref}^{commit}`,
  ]);
  const sha = outcome.stdout.trim();
  return outcome.code === 0 && isCommitSha(sha) ? sha : undefined;
}

/** The new build at `dir`: worktree, install, hook. The first step that fails stops it. */
export async function prepareBuild(
  tools: Tools,
  io: CliIo,
  place: { readonly source: string; readonly dir: string; readonly sha: string },
): Promise<StepFailure | undefined> {
  const added = await gitRun(tools, io)(place.source, ['worktree', 'add', '--detach', place.dir, place.sha]);
  const failed = failureOf(added);
  if (failed !== undefined) return failed;
  const env = { ...minimalEnv(io.env), HUSKY: '0' };
  for (const args of INSTALL_STEPS) {
    const outcome = await runProcess(tools.pnpm.file, [...tools.pnpm.args, ...args], {
      cwd: place.dir,
      env,
      timeoutMs: INSTALL_MINUTES * MS_PER_MINUTE,
    });
    const step = failureOf(outcome);
    if (step !== undefined) return step;
  }
  return undefined;
}

/**
 * Takes a build off the disk, then out of the repo's worktree list. Node removes the folder, not git: pnpm writes
 * paths past 260 characters under `node_modules/.pnpm`, and on the first real upgrade `git worktree remove --force`
 * on Windows left every tracked file of such a build behind. Node's rm reaches those paths, and takes a link off
 * (pnpm's junctions, a symlink on macOS) without following it out of the build. A build is Elvaria's own folder,
 * which nobody edits, so unlike a plot (runner-core's clearLeftover) nothing in it is kept. Returns why a build
 * stays: a program holding one of its files.
 */
export async function removeBuild(
  tools: Tools,
  io: CliIo,
  source: string,
  dir: string,
): Promise<string | undefined> {
  let left: string | undefined;
  try {
    await rm(dir, RM_BUILD);
  } catch (error) {
    left = `${dir}: ${error instanceof Error && 'code' in error ? String(error.code) : String(error)}`;
  }
  await gitRun(tools, io)(source, ['worktree', 'prune']);
  return left;
}

/** The builds on disk besides the ones to keep. */
export async function buildsBesides(root: string, keep: readonly string[]): Promise<string[]> {
  try {
    const entries = await readdir(inKingdom(root, BUILDS_DIR), { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && isCommitSha(entry.name) && !keep.includes(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export { buildDirOf };
