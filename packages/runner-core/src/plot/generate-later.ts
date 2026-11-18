// The generated files a merge quest's merge leaves for later (implementation-plan §3.16.7; PS-09,
// fix/merge-quest-followups (n)). A file a `regenerate` rule names is written anew by the territory's generators once
// a merge took its side; they cannot run while a merge waits in progress, as their commit would conclude it with the
// conflicts in. So when a merge stops, the plot's record keeps the generated files it conflicted in (the knight keeps a
// side by hand) or that a rule resolved before it stopped; the first merge after that stops no more names them in
// its outcome, once, and the Steward runs commands.generate on what the knight concluded.
import { changePlotRecord, plotRecordOf } from './plot-record.ts';
import { ruleOf } from './shared-merge.ts';
import type { ResolvedFile, SharedPaths } from './dry-merge.ts';
import type { Git } from './git.ts';

/** What this reads of merge.ts's MergeOutcome; named here, as merge.ts imports this file. */
interface Outcome {
  readonly stop?: { readonly reason: string; readonly detail: string };
  readonly resolved?: readonly ResolvedFile[];
}

/** The generated files of `outcome`: those a rule resolved, then those its stop left in conflict. */
function generatedIn(outcome: Outcome, shared: SharedPaths): string[] {
  const resolved = (outcome.resolved ?? [])
    .filter(({ rule }) => rule === 'regenerate')
    .map(({ path }) => path);
  // A conflict's detail is its files, one per line (merge.ts stopOf).
  const conflicted = outcome.stop?.reason === 'conflict' ? outcome.stop.detail.split('\n') : [];
  return [...resolved, ...conflicted.filter((path) => ruleOf(path, shared) === 'regenerate')];
}

/** `outcome` of a merge quest's merge, its generated files kept for later while it stops, named once it does not. */
export async function generateLater<T extends Outcome>(
  git: Git,
  worktree: string,
  outcome: T,
  shared: SharedPaths,
): Promise<T & { readonly regenerate?: readonly string[] }> {
  const waiting = (await plotRecordOf(git, worktree)).regenerate_pending ?? [];
  if (outcome.stop !== undefined) {
    const kept = [...new Set([...waiting, ...generatedIn(outcome, shared)])];
    if (kept.length > waiting.length) await changePlotRecord(git, worktree, { regenerate_pending: kept });
    return outcome;
  }
  if (waiting.length === 0) return outcome;
  await changePlotRecord(git, worktree, { regenerate_pending: [] });
  return { ...outcome, regenerate: waiting };
}
