// The check mode of a quest's runs (CM-01, ADR 0032): the run after a session and the merge queue's run hand the
// paths the quest touched to runner-core's checkModeOf, and a territory checked in full reads no plot for it, so it
// runs as before. The judge of a narrow run gets that run's checks (ToolPolicyInput.narrow_checks): its shell and law
// 3 of its prompt follow them, and a whole-tree suite stays out of its reach.
import { checkPolicyOf } from '@elvaria/domain';
import { checkModeOf } from '@elvaria/runner-core';
import type { Quest, Territory, TerritoryCheck } from '@elvaria/domain';
import type { CheckPass, CheckRunMode } from '@elvaria/runner-core';

import { inScratch } from './scratch.ts';
import type { Context } from '../context.ts';
import type { SessionInput } from '../sessions/input.ts';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** How the quest's run `pass` runs its checks; full when the plot cannot be read, which says nothing of what is safe. */
export async function checkModeFor(
  ctx: Context,
  quest: Quest,
  territory: Territory,
  pass: CheckPass,
): Promise<CheckRunMode> {
  if (checkPolicyOf(territory).mode === 'full') return 'full';
  try {
    const touched = await ctx.deps.plots.touched(quest.plot);
    return checkModeOf(territory, touched, { pass, role: quest.party_role, scratch: inScratch(ctx, quest) });
  } catch (error) {
    ctx.deps.log.warn(`steward: ${quest.id}: its checks run in full, its plot unread: ${messageOf(error)}`);
    return 'full';
  }
}

/**
 * `mode` of the `check.*` lines and of plots.check: a narrow run says so; a run in full says nothing, as every line
 * and every run before CM-01.
 */
export const modeMarkOf = (mode: CheckRunMode | undefined): { readonly mode?: 'narrow' } =>
  mode === 'narrow' ? { mode } : {};

/**
 * The territory's checks of the narrow run a judge reads: those that ran (the run's next judge reads the same, P1-38).
 * Undefined for any other session, and for a run in full, whose judge's shell has every check's `run` as before.
 */
export async function narrowChecksFor(
  ctx: Context,
  input: SessionInput,
): Promise<readonly TerritoryCheck[] | undefined> {
  if (input.role !== 'verifier') return undefined;
  if ((await checkModeFor(ctx, input.quest, input.territory, 'session')) === 'full') return undefined;
  const ran = new Set((input.checks ?? []).map(({ id }) => id));
  return input.territory.checks.filter(({ id }) => ran.has(id));
}
