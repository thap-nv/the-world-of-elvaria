// What a new token budget does (PS-28b, TL5): `quest edit --max-tokens` sends the command whatever the figure, then
// says whether it lifts the ceiling the session is held to, computed before and after on the edited quest with the
// breakers' own function (tokenCeilingFor). The ceiling in force is seldom the budget, so a raise below it, or below the
// budget the quest was created with, changes nothing: the line says so and names the smallest figure that would. A
// raise or a cut reaches a running session at the Steward's next tick, as `minuteLines` says of minutes.
import { sessionStaminaOf } from '@elvaria/domain';
import type { Quest, Role } from '@elvaria/domain';

import { atPct, ceilingRulesOf, figureOf, holderOf, sourceText, tokenCeilingIn } from './ceiling.ts';
import { journalOf } from './infirmary.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** The role whose session may be running in a status: a character works the quest, or a judge reads it. */
export const SESSION_ROLE: Partial<Record<Quest['status'], Role>> = {
  working: 'assignee',
  review: 'verifier',
};

/** The role of the session running now: an open attempt_log entry of the status's role. */
export function runningRoleOf(quest: Quest): Role | undefined {
  const role = SESSION_ROLE[quest.status];
  if (role === undefined) return undefined;
  const open = quest.attempt_log.some((run) => run.role === role && run.ended_at === undefined);
  return open ? role : undefined;
}

/** Tokens the running session reported, as its latest notch line says them; none when that line follows minutes. */
async function tokensUsed(ctx: KingdomContext, quest: Quest, role: Role): Promise<number | undefined> {
  const bar = sessionStaminaOf(await journalOf(ctx, quest)).get(quest.id);
  return bar?.role === role && bar.stamina?.measure === 'tokens' ? bar.stamina.used : undefined;
}

/** A running session held to a new ceiling from the next tick: raised, lowered, or already past its new cut. */
async function runningLines(
  ctx: KingdomContext,
  quest: Quest,
  role: Role,
  limits: { readonly was: number; readonly limit: number; readonly cut: number },
): Promise<string[]> {
  const { t } = ctx;
  const params = { id: quest.id, was: limits.was, limit: limits.limit, cut: figureOf('tokens', limits.cut) };
  if (limits.limit > limits.was) return [t('cli.quest.edit.tokens_raised', params)];
  const used = await tokensUsed(ctx, quest, role);
  if (used === undefined || used <= limits.cut) return [t('cli.quest.edit.tokens_lowered', params)];
  const cut = role === 'assignee' ? 'cli.quest.edit.tokens_cut' : 'cli.quest.edit.tokens_cut_judge';
  return [t(cut, { ...params, used: figureOf('tokens', used) })];
}

/**
 * The lines after `quest edit --max-tokens <tokens>`: for the running session's role, else the assignee's next session
 * when the quest has one. An empty seat goes by the budget, so any new figure takes effect and nothing is said.
 */
export async function tokenLines(ctx: KingdomContext, quest: Quest, tokens: number): Promise<string[]> {
  const running = runningRoleOf(quest);
  const role = running ?? 'assignee';
  const character = holderOf(quest, role);
  if (tokens === quest.budget.max_tokens || character === undefined) return [];
  const rules = await ceilingRulesOf(ctx, (await ctx.store.quests.list()).items);
  const before = tokenCeilingIn(quest, role, rules);
  const edited: Quest = { ...quest, budget: { ...quest.budget, max_tokens: tokens } };
  const after = tokenCeilingIn(edited, role, rules);
  if (after.limit === before.limit) {
    const { t } = ctx;
    const who =
      running === undefined
        ? t('cli.quest.edit.next_session', { character })
        : t(`cli.quest.stamina.who.${role}`, { character });
    const why = sourceText(t, edited, after);
    return [
      t('cli.quest.edit.tokens_no_effect', { tokens, who, limit: after.limit, why, from: after.raise_from }),
    ];
  }
  if (running === undefined) return [];
  const limits = { was: before.limit, limit: after.limit, cut: atPct(after.limit, rules.hard_pct) };
  return runningLines(ctx, quest, role, limits);
}
