// Ids a command names must exist before the command is sent: the Steward would reject it a tick later, and the
// owner is still at the terminal now.
import { QuestIdSchema, TerritoryIdSchema } from '@elvaria/domain';
import type { Quest } from '@elvaria/domain';

import { storeIssueLines } from '../issues.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** Problems with the territory id: none when it is attached. */
export async function territoryMissing(ctx: KingdomContext, id: string): Promise<string[]> {
  const unknown = [ctx.t('cli.quest.unknown_territory', { id })];
  const parsed = TerritoryIdSchema.safeParse(id);
  if (!parsed.success) return unknown;
  const read = await ctx.store.territories.read(parsed.data);
  if (read.ok) return [];
  return read.error.code === 'not_found' ? unknown : storeIssueLines(ctx.t, read.error);
}

/** The quest file, or the lines that say why it cannot be read. */
export async function readQuest(ctx: KingdomContext, id: string): Promise<Quest | string[]> {
  const unknown = [ctx.t('cli.quest.unknown_quest', { id })];
  const parsed = QuestIdSchema.safeParse(id);
  if (!parsed.success) return unknown;
  const read = await ctx.store.quests.read(parsed.data);
  if (read.ok) return read.value;
  return read.error.code === 'not_found' ? unknown : storeIssueLines(ctx.t, read.error);
}

/** Problems with quest ids (`--depends-on`): none when every quest file exists. */
export async function questsMissing(ctx: KingdomContext, ids: readonly string[]): Promise<string[]> {
  const reads = await Promise.all(ids.map((id) => readQuest(ctx, id)));
  return reads.flatMap((read) => (Array.isArray(read) ? read : []));
}
