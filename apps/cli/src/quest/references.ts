// Ids a command names must exist before the command is sent: the Steward would reject it a tick later, and the
// owner is still at the terminal now. So is a quest that cannot take the command where it stands refused here.
import { QuestIdSchema, TerritoryIdSchema } from '@elvaria/domain';
import type { Quest, Territory } from '@elvaria/domain';
import type { MessageKey } from '@elvaria/i18n';

import { storeIssueLines } from '../issues.ts';
import { namedBy } from '../kingdom-context.ts';
import { QUEST_STATUS_LABEL } from '../labels.ts';
import type { CommandInput } from '../command-table/command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** The territory file, or the lines that say why it cannot be read. */
export async function readTerritory(ctx: KingdomContext, id: string): Promise<Territory | string[]> {
  const unknown = [ctx.t('cli.quest.unknown_territory', { id })];
  const parsed = TerritoryIdSchema.safeParse(id);
  if (!parsed.success) return unknown;
  const read = await ctx.store.territories.read(parsed.data);
  if (read.ok) return read.value;
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

/** The quest the command line names first (`quest <verb> <id> …`), or undefined once why not is printed. */
export const namedQuest = (input: CommandInput, ctx: KingdomContext): Promise<Quest | undefined> =>
  namedBy(input, ctx, readQuest);

/**
 * The quest the command line names, unless `refusal` gives the line that says why the owner may not act on it now;
 * that line is printed with the quest's id and status. Every quest command that refuses a quest by where it stands
 * refuses through here, so the owner reads the status alike in each (AH-14a).
 */
export async function questUnless(
  input: CommandInput,
  ctx: KingdomContext,
  refusal: (quest: Quest) => MessageKey | undefined,
): Promise<Quest | undefined> {
  const quest = await namedQuest(input, ctx);
  const refused = quest === undefined ? undefined : refusal(quest);
  if (quest === undefined || refused === undefined) return quest;
  ctx.io.err(ctx.t(refused, { id: quest.id, status: ctx.t(QUEST_STATUS_LABEL[quest.status]) }));
  return undefined;
}
