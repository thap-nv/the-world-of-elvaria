// Sibling rows of kingdom.json that do not read as the owner meant (PS-27b, plans/sibling-tribes.md CT7, CT8): a
// sibling_of that is not valid (the row then looks as a tribe of its own), one that names a tribe of another adapter,
// and a `look` written on a sibling, which is ignored. Warnings only: sibling_of is display only (ADR 0025), so a hand
// edit never stops the kingdom, and `elvaria tribe add --sibling-of` writes none of these.
import { siblingProblemOf, siblingRootOf } from '@elvaria/domain';
import type { Tribe } from '@elvaria/domain';

import { finding } from './finding.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Finding } from './finding.ts';

/** What one row's sibling_of, adapter and look say against its root. */
function rowFindings(ctx: Pick<KingdomContext, 't'>, tribes: readonly Tribe[], tribe: Tribe): Finding[] {
  const { t } = ctx;
  const params = { tribe: tribe.id, root: tribe.sibling_of ?? '' };
  const problem = siblingProblemOf(tribes, tribe);
  if (problem !== undefined) return [finding('warn', t(`cli.doctor.sibling.${problem}`, params))];
  const root = siblingRootOf(tribes, tribe);
  if (root === undefined) return [];
  const adapters = { ...params, adapter: tribe.adapter, root_adapter: root.adapter };
  return [
    ...(root.adapter === tribe.adapter
      ? []
      : [finding('warn', t('cli.doctor.sibling.other_adapter', adapters))]),
    ...(tribe.look === undefined ? [] : [finding('warn', t('cli.doctor.sibling.look_ignored', params))]),
  ];
}

/** Every row's sibling warnings, in the order of kingdom.tribes[]. */
export const siblingFindings = (ctx: Pick<KingdomContext, 'kingdom' | 't'>): Finding[] =>
  ctx.kingdom.tribes.flatMap((tribe) => rowFindings(ctx, ctx.kingdom.tribes, tribe));
