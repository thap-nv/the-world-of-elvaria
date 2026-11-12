// A quest's scope on the command line (implementation-plan §3.16.5, ADR 0028, PS-05): `--scope` on `quest add` and
// `quest edit`, and why a quest waits on its territory's scope rules, as `quest list` and `quest show` say it.
import { scopeHolderOf } from '@elvaria/domain';
import type { Quest, QuestId, ScopeWait, Territory } from '@elvaria/domain';

import { textOptions } from '../args.ts';
import type { CommandInput } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** `--scope`, repeated: the globs in the order given, each once; none when absent. */
export const readScope = (input: CommandInput): string[] => [...new Set(textOptions(input, 'scope'))];

/** Statuses in which a quest waits to start a session: the scope rules may be what it waits for. */
const WAITING: readonly Quest['status'][] = ['open', 'claimed', 'returned'];

/** The quests among `quests` that wait on their territory's scope rules, and for whom (scopeHolderOf). */
export async function scopeWaitsOf(
  ctx: KingdomContext,
  quests: readonly Quest[],
): Promise<Map<QuestId, ScopeWait>> {
  const { items } = await ctx.store.territories.list();
  const territories = new Map<string, Territory>(items.map((territory) => [territory.id, territory]));
  return new Map(
    quests.flatMap((quest) => {
      if (!WAITING.includes(quest.status)) return [];
      const wait = scopeHolderOf(quest, quests, territories.get(quest.territory));
      return wait === null ? [] : [[quest.id, wait] as const];
    }),
  );
}

/** What a quest waits for, in the owner's language. */
export const scopeWaitText = (ctx: KingdomContext, wait: ScopeWait): string =>
  ctx.t(wait.rule === 'scope' ? 'cli.quest.scope.waits_scope' : 'cli.quest.scope.waits_alone', {
    holder: wait.holder,
  });
