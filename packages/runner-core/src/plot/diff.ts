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
