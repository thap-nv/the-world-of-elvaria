// What each done quest touched, the merge queue's order (implementation-plan §3.16.7; PS-09, forgeDeliveries): how
// many of its touched files a glob of the territory's shared_paths matches, and how many it touched, read from its
// plot (Plots.touched) the first time the Steward sees it done and kept in memory (a restarted Steward reads it once
// more). A plot that cannot be read sorts last, and is not read again.
import { forgeDue } from '@elvaria/domain';
import { ruleOf } from '@elvaria/runner-core';
import type { ForgeSize } from '@elvaria/domain';

import type { Context } from '../context.ts';
import type { ForgeBook } from './book.ts';

const UNREAD = Number.MAX_SAFE_INTEGER;

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The sizes of every done quest the queue may take, each read once. */
export async function forgeSizesOf(ctx: Context, book: ForgeBook): Promise<ForgeSize[]> {
  for (const quest of ctx.world.quests.values()) {
    const territory = ctx.world.territories.get(quest.territory);
    if (book.sizes.has(quest.id) || territory === undefined || !forgeDue(quest, territory)) continue;
    try {
      const touched = await ctx.deps.plots.touched(quest.plot);
      const shared = touched.filter(
        (file) => ruleOf(file, territory.shared_paths ?? []) !== undefined,
      ).length;
      book.sizes.set(quest.id, { quest: quest.id, shared, touched: touched.length });
    } catch (error) {
      ctx.deps.log.warn(`steward: ${quest.id}: what it touched cannot be read: ${messageOf(error)}`);
      book.sizes.set(quest.id, { quest: quest.id, shared: UNREAD, touched: UNREAD });
    }
  }
  return [...book.sizes.values()];
}
