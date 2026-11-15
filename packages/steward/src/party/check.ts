// The Steward's own check before the judge of a party's merge quest (implementation-plan §3.13 step 5, P1-18): every
// part's branch is in the merge quest's branch, and on a git territory its base branch too (PS-08e). A merge stopped
// on a conflict leaves the branches after it for the next session, and a base branch merge that stopped before the
// checks is undone with the plot after them; this check then sends the quest back (`incomplete`, domain's pass rule)
// so the next session gets them, instead of a judge passing a party with a part or the base branch missing.
import { PARTY_CHECK_ID } from '@elvaria/domain';
import type { Quest, VerdictCheck } from '@elvaria/domain';
import { inKingdom, writeFileAtomic } from '@elvaria/store';

import { mergesOf } from './plot.ts';
import type { Context } from '../context.ts';

/** The party's check for run folder `runDir` (`.runs/<quest>-<n>`): one for a merge quest with parts, else none. */
export async function partyChecks(ctx: Context, quest: Quest, runDir: string): Promise<VerdictCheck[]> {
  if (quest.party_role !== 'merge') return [];
  const { branches: parts, base } = mergesOf(ctx, quest);
  if (parts.length === 0) return [];
  const started = ctx.deps.clock.now();
  const wanted = [...parts, ...(base?.vcs.default_branch === undefined ? [] : [base.vcs.default_branch])];
  const missing = await ctx.deps.plots.unmerged(quest.plot, parts, base);
  const into = quest.plot.branch ?? quest.id;
  const lines = wanted.map((branch) => `${missing.includes(branch) ? '✗' : '✓'} ${branch}`);
  const verdict =
    missing.length === 0
      ? `every part of party ${String(quest.party_id)}${base === undefined ? '' : ' and the base branch'} is merged into ${into}`
      : `${missing.length} of ${wanted.length} branches are not merged into ${into}: the next session of the merge quest gets them`;
  const logPath = `${runDir}/checks/${PARTY_CHECK_ID}.log`;
  await writeFileAtomic(inKingdom(ctx.root, logPath), `party: ${verdict}\n${lines.join('\n')}\n`);
  return [
    {
      id: PARTY_CHECK_ID,
      pass: missing.length === 0,
      duration_ms: ctx.deps.clock.now() - started,
      log_path: logPath,
    },
  ];
}
