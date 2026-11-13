// The trial of a territory (PS-25, implementation-plan §3.16.1): before a quest is given there, does commands.setup run
// and does every check pass on a clean plot at the head of its default branch? A detached worktree
// `<repo>/<worktree_dir>/trial-<territory>` at the commit a new quest would fork from (forkPoint), commands.setup the
// way a quest plot runs it (one log, SETUP_TIMEOUT_MS), then every check the way the Steward runs them (runChecks:
// those that are not exclusive first, the exclusive ones under the territory's lock, a failure for the environment
// told apart). No branch is made, and the worktree goes, whatever happened, once the trial ends: it leaves only its
// logs in the kingdom's `.runs/`. 0 mana: no session, no model.
import process from 'node:process';

import { commandLinesOf } from '@elvaria/domain';
import type { Territory, TerritoryTrial, TrialCheck, TrialStep } from '@elvaria/domain';
import { fromPortable } from '@elvaria/store';

import { withEnvironment } from '../checks/environment.ts';
import { openLog, runLine } from '../checks/logged-run.ts';
import { runChecks } from '../checks/run-checks.ts';
import type { CheckRun } from '../checks/run-checks.ts';
import type { ProcessHost } from '../process/program.ts';
import { gitOf } from './git.ts';
import type { Git } from './git.ts';
import { ensureLongPaths, ensurePlotExcludes } from './repo-settings.ts';
import { removeScratch } from './scratch.ts';
import { SETUP_TIMEOUT_MS, setupLogOf } from './setup.ts';
import { failureInLogFile } from './trial-log.ts';
import { forkPoint, worktreePathOf } from './worktree.ts';

/** The trial's id in the kingdom's `.runs/` and in the territory's worktree folder; no quest id starts with it. */
export const trialIdOf = (territory: string): string => `trial-${territory}`;

/** Portable, relative to the kingdom: the checks' logs, `<dir>/checks/<id>.log`. */
export const trialRunDirOf = (territory: string): string => `.runs/${trialIdOf(territory)}`;

export interface TerritoryTrialRequest {
  /** The kingdom root, native: the logs and the exclusive lock live there. */
  readonly kingdom: string;
  readonly territory: Territory;
  readonly host: ProcessHost;
  /** Decides `core.longpaths` (Windows only), as for a quest plot; defaults to this machine. */
  readonly platform?: NodeJS.Platform;
  /** Kills the running command and starts no other (Ctrl+C); the worktree still goes. */
  readonly signal?: AbortSignal;
  /** The gazetteer's stamp: the trial counts the commits from it to the commit it tries. */
  readonly stamp?: string;
}

export interface TerritoryTrialRun {
  readonly trial: TerritoryTrial;
  /** Commits from `stamp` to the commit tried; null when git does not know the stamp; absent: not counted. */
  readonly commits_since?: number | null;
  /** Why the trial's folder stays (a program holds it); absent when it is gone. */
  readonly leftover?: string;
}

const failed = (detail: string, base: string | null = null): TerritoryTrialRun => ({
  trial: { base, plot_failure: detail, setup: null, checks: [] },
});

/** What a failed command's log says, over what the step knew of itself. */
async function withLog<Step extends TrialStep>(kingdom: string, step: Step): Promise<Step> {
  if (step.pass) return step;
  const told = await failureInLogFile(kingdom, step.log_path);
  return {
    ...step,
    ...(told.command === undefined ? {} : { command: told.command }),
    ...(told.line === undefined ? {} : { error_line: told.line }),
  };
}

/** commands.setup in the trial's plot: the log and timeout of a quest plot's setup (setup.ts), no secrets. */
async function setupStep(request: TerritoryTrialRequest, worktree: string): Promise<TrialStep | null> {
  const { kingdom, territory, host, signal } = request;
  const command = territory.commands.setup;
  if (command === undefined) return null;
  const logPath = setupLogOf(trialIdOf(territory.id));
  const log = await openLog(kingdom, logPath, `$ ${command}`);
  const context = { cwd: worktree, host, ...(signal === undefined ? {} : { signal }) };
  const run = await runLine(command, context, log, SETUP_TIMEOUT_MS).finally(() => log.close());
  const pass = run.exit_code === 0 && signal?.aborted !== true;
  const step = {
    command,
    pass,
    duration_ms: run.duration_ms,
    timed_out: run.timed_out,
    exit_code: run.exit_code,
  };
  const known = await withEnvironment({ ...step, log_path: logPath }, kingdom, territory.environment_errors);
  return withLog(kingdom, known);
}

async function checkStep(kingdom: string, territory: Territory, run: CheckRun): Promise<TrialCheck> {
  const check = territory.checks.find(({ id }) => id === run.id);
  const lines = check === undefined ? [] : commandLinesOf(check.run);
  const step: TrialCheck = {
    id: run.id,
    timeout_minutes: check?.timeout_minutes ?? 0,
    command: lines.at(-1) ?? '',
    pass: run.pass,
    duration_ms: run.duration_ms,
    timed_out: run.timed_out,
    exit_code: run.exit_code,
    log_path: run.log_path,
    ...(run.environment === undefined ? {} : { environment: run.environment }),
  };
  return withLog(kingdom, step);
}

/** Setup, then every check of the territory unless the setup failed, in the trial's plot. */
async function stepsIn(request: TerritoryTrialRequest, worktree: string) {
  const { kingdom, territory, host, signal } = request;
  const setup = await setupStep(request, worktree);
  if (setup !== null && !setup.pass) return { setup, checks: [] };
  // A party's merge quest runs every check whatever it touched (select-checks.ts): so does the trial.
  const runs = await runChecks(
    {
      kingdom,
      territory,
      touched: [],
      cwd: worktree,
      run_dir: trialRunDirOf(territory.id),
      party_role: 'merge',
      ...(signal === undefined ? {} : { signal }),
    },
    host,
  );
  const checks = await Promise.all(runs.map((run) => checkStep(kingdom, territory, run)));
  return { setup, checks };
}

/** Commits from `stamp` to `base`; null when git does not know the stamp. */
async function commitsSince(git: Git, repo: string, stamp: string, base: string): Promise<number | null> {
  const run = await git(repo, ['rev-list', '--count', `${stamp}..${base}`]);
  const count = Number.parseInt(run.stdout.trim(), 10);
  return run.code === 0 && Number.isInteger(count) ? count : null;
}

/** The trial in its detached worktree at `base`, made here; the caller removes it. */
async function inTrialPlot(
  request: TerritoryTrialRequest,
  git: Git,
  target: { readonly repo: string; readonly worktree: string },
  base: string,
): Promise<TerritoryTrialRun> {
  const { repo, worktree } = target;
  const added = await git(repo, ['worktree', 'add', '--quiet', '--detach', worktree, base]);
  if (added.code !== 0) return failed(added.stderr.trim(), base);
  const steps = await stepsIn(request, worktree);
  const { stamp } = request;
  const commits = stamp === undefined ? {} : { commits_since: await commitsSince(git, repo, stamp, base) };
  return { trial: { base, ...steps }, ...commits };
}

/** Tries the territory; never throws for what git or the territory's commands do, only for a broken machine. */
export async function tryTerritory(request: TerritoryTrialRequest): Promise<TerritoryTrialRun> {
  const { territory, host } = request;
  if (territory.vcs.type !== 'git') return failed('the territory has no git: no branch to try');
  const git = await gitOf(host);
  if (git === undefined) return failed('git is not found');
  const repo = fromPortable(territory.path);
  const common = await git(repo, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (common.code !== 0) return failed(`${repo}: ${common.stderr.trim()}`);
  // What prepare ensures for every quest plot, so the trial's folder stays out of the owner's status.
  await ensurePlotExcludes(common.stdout.trim());
  await ensureLongPaths(git, repo, request.platform ?? process.platform);
  const fork = await forkPoint({ git, repo, vcs: territory.vcs });
  if (!fork.ok) return failed(fork.error.detail);
  const base = fork.value;
  const target = { repo, worktree: worktreePathOf(repo, territory.worktree_dir, trialIdOf(territory.id)) };
  // A trial stopped hard (the terminal closed) left its folder: it goes first, as a judge's scratch plot does.
  const left = await removeScratch(git, target, []);
  if (left !== undefined) return failed(`${target.worktree}: ${left}`, base);
  let run: TerritoryTrialRun | undefined;
  try {
    run = await inTrialPlot(request, git, target, base);
  } finally {
    // Dirty or not: what the commands wrote there is the trial's, never the owner's.
    const leftover = await removeScratch(git, target, []);
    if (leftover !== undefined && run !== undefined)
      run = { ...run, leftover: `${target.worktree}: ${leftover}` };
  }
  return run;
}
