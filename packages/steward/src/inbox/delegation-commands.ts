// The owner's commands on the breaker of the seal delegation (implementation-plan §3.16.7, ADR 0023; PS-08g, K11).
// `report_escape` (`elvaria quest escaped`): a defect escaped into the base branch with a quest already there; the
// Steward writes `quest.escaped`, which the metrics count sealed or not, and a quest the delegation merged without the
// seal suspends its territory's delegation (escapeSuspension). `resume_delegation` (`elvaria territory delegation
// --resume`): the owner read what escaped and lets new quests there go without the seal again. The domain's refusals
// are the CLI's too (escapeOf), so a command refused here was refused at the terminal unless the log moved since.
import { escapeOf, escapeSuspension } from '@elvaria/domain';
import type { Quest, TerritoryId } from '@elvaria/domain';

import { setSuspension } from '../delegation/book.ts';
import { suspendDelegation } from '../delegation/suspend.ts';
import { OWNER } from '../quest/record.ts';
import { APPLIED, rejected } from './quest-commands.ts';
import type { Context } from '../context.ts';
import type { Outcome } from './quest-commands.ts';

/** `report_escape`: the report's line, then the suspension it brings, if any. */
export async function reportEscape(ctx: Context, quest: Quest, note: string | undefined): Promise<Outcome> {
  const line = escapeOf((await ctx.deps.events.read()).events, quest.id, note);
  if (!line.ok) return rejected(line.error.code);
  await ctx.record.note({ type: 'quest.escaped', actor: OWNER, quest, data: line.value });
  const suspension = escapeSuspension(line.value, ctx.delegation.suspensions);
  if (suspension !== undefined) await suspendDelegation(ctx, suspension);
  return APPLIED;
}

/** `resume_delegation`: a suspended territory's delegation works again from the next quest made there. */
export async function resumeDelegation(ctx: Context, territory: TerritoryId): Promise<Outcome> {
  if (!ctx.world.territories.has(territory)) return rejected('unknown_territory');
  if (!ctx.delegation.suspensions.some((held) => held.territory === territory))
    return rejected('not_suspended');
  await ctx.record.note({ type: 'delegation.resumed', actor: OWNER, territory, data: { territory } });
  setSuspension(ctx.delegation, territory, undefined);
  return APPLIED;
}
