// The territory's generators run by the machine (implementation-plan §3.16.5; PS-09): after the merge queue merged the
// base branch into a done quest's plot, each command of commands.generate runs there in order, with the quest's
// secrets as its setup gets them, its output in `.runs/<quest>-delivery/generate.log`, its tree killed when the
// Steward stops. A generator may only rewrite hot files: any other file it changed or added goes back as HEAD has it
// and is named, so the owner hears of a generator that writes where it should not. What it changed is committed by
// the Steward, with the territory's hooks.
import { inKingdom, readTextFile } from '@elvaria/store';

import { openLog, runLines } from '../checks/logged-run.ts';
import { MS_PER_MINUTE, withSecrets } from '../checks/run-checks.ts';
import { gitOut, zList } from './git.ts';
import { plotCommitMessage } from './commit-message.ts';
import { ruleOf } from './shared-merge.ts';
import { commitWorktree } from './worktree-ops.ts';
import type { SharedPaths } from './dry-merge.ts';
import type { Git } from './git.ts';
import type { ProcessHost } from '../process/program.ts';

/** Generators of a repo the size of Elvaria's take seconds; this bounds one that hangs. */
export const GENERATE_TIMEOUT_MS = 10 * MS_PER_MINUTE;

/** Portable, relative to the kingdom: the delivery's generators, beside its push log and its checks. */
export const generateLogOf = (questId: string): string => `.runs/${questId}-delivery/generate.log`;

export interface GenerateInput {
  readonly kingdom: string;
  readonly quest_id: string;
  /** The plot, native, on branch `into`. */
  readonly worktree: string;
  readonly into: string;
  readonly commands: readonly string[];
  readonly shared: SharedPaths;
  readonly host: ProcessHost;
  readonly secrets?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
}

export type GenerateOutcome =
  /** The territory has no generator. */
  | { readonly status: 'none' }
  /** The generators ran; `sha` is their commit when they changed a hot file; `restored` the other files they changed. */
  | { readonly status: 'done'; readonly sha?: string; readonly restored: readonly string[] }
  /** A generator failed, timed out or was stopped; `detail` is its log, masked. */
  | { readonly status: 'failed'; readonly log_path: string; readonly detail: string }
  /** The hooks refused the commit of what they changed; `detail` says why. */
  | { readonly status: 'refused'; readonly detail: string; readonly restored: readonly string[] };

/** What the generators changed or added outside the hot files goes back as HEAD has it; their paths. */
async function restoreOutside(git: Git, worktree: string, shared: SharedPaths): Promise<string[]> {
  const outside = (paths: readonly string[]) => paths.filter((file) => ruleOf(file, shared) === undefined);
  const tracked = outside(
    zList(await gitOut(git, worktree, ['diff', '--name-only', '--no-renames', '-z', 'HEAD'])),
  );
  const added = outside(
    zList(await gitOut(git, worktree, ['ls-files', '--others', '--exclude-standard', '-z'])),
  );
  if (tracked.length > 0)
    await gitOut(git, worktree, ['--literal-pathspecs', 'checkout', 'HEAD', '--', ...tracked]);
  if (added.length > 0)
    await gitOut(git, worktree, ['--literal-pathspecs', 'clean', '--quiet', '--force', '--', ...added]);
  return [...tracked, ...added].sort();
}

/** Runs the territory's generators in the plot, then commits the hot files they rewrote. */
export async function generateIn(git: Git, input: GenerateInput): Promise<GenerateOutcome> {
  const { commands, signal } = input;
  if (commands.length === 0) return { status: 'none' };
  const logPath = generateLogOf(input.quest_id);
  const given = withSecrets(input.host, input.secrets);
  const log = await openLog(input.kingdom, logPath, `$ ${commands[0] ?? ''}`, given.known);
  const context = { cwd: input.worktree, host: given.host, ...(signal === undefined ? {} : { signal }) };
  const run = await runLines([...commands], context, log, GENERATE_TIMEOUT_MS).finally(() => log.close());
  if (run.exit_code !== 0 || run.timed_out || signal?.aborted === true) {
    const detail = (await readTextFile(inKingdom(input.kingdom, logPath))) ?? `${commands.join(', ')} failed`;
    return { status: 'failed', log_path: logPath, detail };
  }
  const restored = await restoreOutside(git, input.worktree, input.shared);
  const commit = await commitWorktree(git, input.worktree, plotCommitMessage.generate(input.into));
  if (commit.status === 'refused') return { status: 'refused', detail: commit.detail, restored };
  return { status: 'done', restored, ...(commit.status === 'committed' ? { sha: commit.sha } : {}) };
}
