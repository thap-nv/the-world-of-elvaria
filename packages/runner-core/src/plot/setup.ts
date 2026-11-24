// `commands.setup` runs in a worktree plot until it succeeds once (implementation-plan §3.3: `pnpm install` against
// the global store), so a setup killed halfway is not taken as done; a merge quest that took the base branch in
// (PS-08e, mergeBase) sets it up once more. (fix/plot-setup-on-lockfile) With commands.setup_when it runs again too
// once a file those globs match differs from what its last success read: a quest that adds a dependency changes the
// lockfile, and the territory's hooks at the Steward's next commit would run on what the old one installed (AH-07b1
// and AH-07b2 were both refused so, breaker:commit_errors). The plot's record keeps a digest of those files; prepare
// and refreshSetup, which the Steward calls before each of its commits, compare it with the files as they are.
// It gets the quest's secrets the way its checks do (P1-30, §3.9): an install from a private registry needs the
// token the session would get, and its log loses their values when it closes. The caller's signal kills it (P1-49,
// (a) of P1-47): a Steward stopped with Ctrl+C no longer waits up to SETUP_TIMEOUT_MS for an install.
import { createHash } from 'node:crypto';
import path from 'node:path';

import { err, ok } from '@elvaria/domain';
import type { Quest, Result, Territory } from '@elvaria/domain';
import { fromPortable, pathExists, readTextFile } from '@elvaria/store';

import { globToRegExp } from '../checks/glob.ts';
import { openLog, runLine } from '../checks/logged-run.ts';
import type { ProcessHost } from '../process/program.ts';
import { MS_PER_MINUTE, withSecrets } from '../checks/run-checks.ts';
import { gitOut, zList } from './git.ts';
import type { Git } from './git.ts';
import { gitDirOf, readPlotRecord, writePlotRecord } from './plot-record.ts';
import type { PlotRecord } from './plot-record.ts';
import type { PlotFailure } from './worktree.ts';

/** The territory has no setup timeout of its own; a cold `pnpm install` of a large repo fits in this. */
export const SETUP_TIMEOUT_MS = 30 * MS_PER_MINUTE;

/** Portable, relative to the kingdom; beside the attempts' run folders, since setup belongs to none of them. */
export const setupLogOf = (questId: string): string => `.runs/${questId}-setup.log`;

export interface SetupRun {
  readonly exit_code: number | null;
  readonly timed_out: boolean;
  readonly duration_ms: number;
  readonly log_path: string;
}

export interface SetupInput {
  readonly kingdom: string;
  readonly quest_id: string;
  readonly worktree: string;
  readonly git_dir: string;
  readonly record: PlotRecord;
  readonly command: string | undefined;
  readonly host: ProcessHost;
  /**
   * The quest's `secrets_required`, treasury name → value (P1-30): added to the host's minimal env with sessionEnv
   * (no `ELVARIA_*`: setup is not a session) and masked in the setup's log. Absent or empty: the minimal env alone.
   */
  readonly secrets?: Readonly<Record<string, string>>;
  /**
   * Aborted when nobody waits for the plot any more (the Steward stops, P1-49): the setup's tree is killed and the
   * plot stays not set up, so the next prepare runs it again.
   */
  readonly signal?: AbortSignal;
  /**
   * (fix/plot-setup-on-lockfile) commands.setup_when, with the git that lists what they match: a setup that succeeded
   * runs again once those files differ from what it read. Absent, or no glob: it never runs again.
   */
  readonly when?: { readonly git: Git; readonly globs: readonly string[] };
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

/**
 * One digest of the files `globs` match in the worktree (as check_policy.full_when's do), each by its path and
 * content: tracked or new, the ignored ones aside, so `**\/package.json` never walks node_modules; a tracked file
 * deleted counts as gone. undefined for a territory without setup_when.
 */
async function inputsOf({ when, worktree }: SetupInput): Promise<string | undefined> {
  if (when === undefined || when.globs.length === 0) return undefined;
  const matchers = when.globs.map((glob) => globToRegExp(glob));
  const listed = await gitOut(when.git, worktree, [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
  ]);
  const files = [...new Set(zList(listed))].filter((file) => matchers.some((glob) => glob.test(file))).sort();
  const lines = await Promise.all(
    files.map(async (file) => {
      const text = await readTextFile(path.join(worktree, file));
      return `${file}\0${text === undefined ? 'gone' : sha256(text)}`;
    }),
  );
  return sha256(lines.join('\n'));
}

/** The record after a setup that succeeded: the digest of what it read when setup_when asks for one, else none. */
function setUp(record: PlotRecord, inputs: string | undefined): PlotRecord {
  const { setup_inputs: _before, ...rest } = record;
  return { ...rest, setup_done: true, ...(inputs === undefined ? {} : { setup_inputs: inputs }) };
}

/** How a setup that did not succeed ended, for its PlotFailure. */
function endOf(run: { exit_code: number | null; timed_out: boolean }, signal?: AbortSignal): string {
  if (run.timed_out) return 'timed out';
  if (signal?.aborted === true) return 'stopped before its end';
  return `ended with ${run.exit_code ?? 'no exit code'}`;
}

/**
 * null when the territory has no setup, it already succeeded in this worktree on the files of setup_when as they are,
 * or a merge is in progress there: a merge quest's conflict (PS-08e) may sit in the lockfile, so setup waits for the
 * commit that concludes it. A record with no digest while setup_when has globs (a plot set up before they were
 * written) is not known to be current: setup runs once more.
 */
export async function runSetup(input: SetupInput): Promise<Result<SetupRun | null, PlotFailure>> {
  const { command, record, signal } = input;
  if (command === undefined) return ok(null);
  const read = await inputsOf(input);
  if (record.setup_done && (read === undefined || read === record.setup_inputs)) return ok(null);
  if (await pathExists(path.join(input.git_dir, 'MERGE_HEAD'))) return ok(null);
  const logPath = setupLogOf(input.quest_id);
  const given = withSecrets(input.host, input.secrets);
  const log = await openLog(input.kingdom, logPath, `$ ${command}`, given.known);
  const context = { cwd: input.worktree, host: given.host, ...(signal === undefined ? {} : { signal }) };
  const run = await runLine(command, context, log, SETUP_TIMEOUT_MS).finally(() => log.close());
  if (run.exit_code !== 0 || signal?.aborted === true) {
    return err({ reason: 'setup_failed', detail: `${command}: ${endOf(run, signal)}`, log_path: logPath });
  }
  // Read again: an install may rewrite the lockfile it was given, and what it installed matches the rewrite.
  await writePlotRecord(input.git_dir, setUp(record, await inputsOf(input)));
  return ok({ exit_code: run.exit_code, timed_out: false, duration_ms: run.duration_ms, log_path: logPath });
}

/** What the Steward's commits ask of the PlotManager, which extends it (fix/plot-setup-on-lockfile). */
export interface SetupMethods {
  /**
   * commands.setup in the quest's worktree when it is due there (runSetup): never succeeded, or a file of
   * commands.setup_when changed since it did. With `options.secrets`, killed by `options.signal` (P1-49); null when
   * it was not due, and for a plot without git or without a record. The Steward calls it before each of its commits.
   */
  refreshSetup(
    quest: Pick<Quest, 'id' | 'plot'>,
    territory: Territory,
    options?: { readonly secrets?: Readonly<Record<string, string>>; readonly signal?: AbortSignal },
  ): Promise<Result<SetupRun | null, PlotFailure>>;
}

export function setupMethods(
  options: { readonly kingdom: string; readonly host: ProcessHost },
  git: () => Promise<Git>,
): SetupMethods {
  return {
    refreshSetup: async ({ id, plot }, territory, { secrets, signal } = {}) => {
      if (plot.type !== 'worktree' || plot.path === undefined) return ok(null);
      const found = await git();
      const worktree = fromPortable(plot.path);
      const gitDir = await gitDirOf(found, worktree);
      const record = await readPlotRecord(gitDir);
      if (record === undefined) return ok(null);
      return runSetup({
        kingdom: options.kingdom,
        quest_id: id,
        worktree,
        git_dir: gitDir,
        record,
        command: territory.commands.setup,
        host: options.host,
        when: { git: found, globs: territory.commands.setup_when ?? [] },
        ...(secrets === undefined ? {} : { secrets }),
        ...(signal === undefined ? {} : { signal }),
      });
    },
  };
}
