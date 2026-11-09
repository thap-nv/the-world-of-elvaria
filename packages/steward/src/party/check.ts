// The Steward's own check before the judge of a party's merge quest (implementation-plan §3.13 step 5, P1-18): every
// part's branch is in the merge quest's branch. A merge stopped on a conflict leaves the parts after it for the next
// session; once its knight concluded that one, this check sends the quest back (`incomplete`, domain's pass rule) so
// the next session gets them, instead of a judge passing a party with a part missing.
import { PARTY_CHECK_ID, plotBaseOf } from '@elvaria/domain';
import type { Quest, VerdictCheck } from '@elvaria/domain';
import { inKingdom, writeFileAtomic } from '@elvaria/store';

import type { Context } from '../context.ts';

/** The party's check for run folder `runDir` (`.runs/<quest>-<n>`): one for a merge quest with parts, else none. */
export async function partyChecks(ctx: Context, quest: Quest, runDir: string): Promise<VerdictCheck[]> {
  if (quest.party_role !== 'merge') return [];
  const { merge: parts } = plotBaseOf(quest, [...ctx.world.quests.values()]);
  if (parts.length === 0) return [];
  const started = ctx.deps.clock.now();
  const missing = await ctx.deps.plots.unmerged(quest.plot, parts);
  const into = quest.plot.branch ?? quest.id;
  const lines = parts.map((part) => `${missing.includes(part) ? '✗' : '✓'} ${part}`);
  const verdict =
    missing.length === 0
      ? `every part of party ${String(quest.party_id)} is merged into ${into}`
      : `${missing.length} of ${parts.length} parts are not merged into ${into}: the next session of the merge quest gets them`;
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
