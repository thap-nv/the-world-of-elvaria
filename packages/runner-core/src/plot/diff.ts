// The diff a judge reads in its prompt (implementation-plan §3.2, P1-15): `git diff <base>...HEAD`, the summary
// first, then the whole patch, against the commit the quest branch forked from (its plot record), so commits other
// people made on the default branch since never show up as the quest's work. The patch has a ceiling: the judge
// reads the rest in the plot, and the prompt stays within what a CLI takes (Antigravity reads its prompt from the
// command line, which Windows stops at 32 767 characters).
import { gitOut } from './git.ts';
import type { Git } from './git.ts';
import { plotRecordOf } from './plot-record.ts';

/** Characters of summary and patch together; a cut patch ends on a whole line. */
export const DIFF_MAX_CHARS = 16_000;

/** No pager, no colour, no external diff tool of the owner's git config, and paths at full width. */
const DIFF_FLAGS = ['--no-color', '--no-ext-diff'] as const;
const STAT_WIDTH = '--stat=200';

/**
 * `stat` and `patch` as one text of at most `max` characters; empty when nothing changed. A patch that does not
 * fit is cut at a line end, and the last line says where the rest is.
 */
export function cappedDiff(stat: string, patch: string, range: string, max = DIFF_MAX_CHARS): string {
  if (patch.trim() === '') return '';
  const head = stat.trimEnd();
  const whole = `${head}\n\n${patch.trimEnd()}`;
  if (whole.length <= max) return whole;
  const note = `[diff cut at ${max} characters; the rest is in the plot: git diff ${range}]`;
  const room = Math.max(0, max - head.length - note.length - 3);
  const part = patch.slice(0, room);
  return `${head}\n\n${part.slice(0, part.lastIndexOf('\n') + 1)}${note}`;
}

/** The quest branch's changes since it forked, as cappedDiff gives them. */
export async function diffIn(git: Git, worktree: string): Promise<string> {
  const record = await plotRecordOf(git, worktree);
  const range = `${record.base}...HEAD`;
  const stat = await gitOut(git, worktree, ['diff', ...DIFF_FLAGS, STAT_WIDTH, range]);
  const patch = await gitOut(git, worktree, ['diff', ...DIFF_FLAGS, range]);
  return cappedDiff(stat, patch, range);
}

/**
 * What a judge reads of the branch (P1-21 (e)): `branch`, all of it since its fork point; `after_merges`, a party's
 * merge quest's own work.
 */
export type DiffScope = 'branch' | 'after_merges';

/** Enough of a commit id to name it in a prompt. */
const SHORT_ID = 12;

/**
 * A party's merge quest (P1-21 (e)): each part was judged on its own, and the whole party against the contract is
 * cut at DIFF_MAX_CHARS, so its judge reads what the merge quest did itself: what changed after its last merge, then
 * every merge with the conflicts it resolved (git's dense combined diff shows only where the result differs from
 * each side; a clean merge shows its subject alone). A branch with no merge yet gives the whole branch.
 */
export async function diffAfterMerges(git: Git, worktree: string): Promise<string> {
  const record = await plotRecordOf(git, worktree);
  const since = `${record.base}..HEAD`;
  const last = (await gitOut(git, worktree, ['rev-list', '--merges', '--max-count=1', since])).trim();
  if (last === '') return diffIn(git, worktree);
  const range = `${last}..HEAD`;
  const stat = await gitOut(git, worktree, ['diff', ...DIFF_FLAGS, STAT_WIDTH, range]);
  const patch = await gitOut(git, worktree, ['diff', ...DIFF_FLAGS, range]);
  const merges = await gitOut(git, worktree, [
    'log',
    ...DIFF_FLAGS,
    '-p',
    '--cc',
    '--merges',
    '--format=commit %h %s',
    since,
  ]);
  const note = `[The merge quest's own work: what changed after its last merge (${last.slice(0, SHORT_ID)}), then each merge and the conflicts it resolved. Each part was judged on its own; the whole party is \`git diff ${record.base.slice(0, SHORT_ID)}...HEAD\` in the plot.]`;
  const after = stat.trim() === '' ? 'Nothing changed after the last merge.' : stat.trimEnd();
  const resolved = `The merges, with the conflicts each resolved:\n\n${merges.trimEnd()}`;
  return cappedDiff(`${note}\n\n${after}`, [patch.trimEnd(), resolved].filter(Boolean).join('\n\n'), range);
}
