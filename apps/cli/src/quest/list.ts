// `elvaria quest list`: the quest board, oldest first (ids sort by day). Commands still in the inbox are counted
// under it, because a quest the owner just added exists only as a command until the Steward's next tick. A party's
// member says its role and where the party stands (P1-21 (c)).
import { QUEST_STATUSES } from '@elvaria/domain';
import type { Quest, QuestId, QuestStatus, Registry } from '@elvaria/domain';

import { textOptions, textOption } from '../args.ts';
import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { QUEST_STATUS_LABEL, nameIn } from '../labels.ts';
import { NONE, printListing } from '../listing.ts';
import { partyCell } from './party.ts';
import { unclaimableOf } from './unclaimable.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

const isStatus = (value: string): value is QuestStatus =>
  (QUEST_STATUSES as readonly string[]).includes(value);

/** Display name of a kind in the owner's language; the id when the registry cannot be read. */
export function kindName(ctx: KingdomContext, registry: Registry | undefined, kind: string): string {
  const entry = registry?.kinds.find((candidate) => candidate.id === kind);
  return entry === undefined ? kind : nameIn(ctx.locale, entry);
}

/** The status, marked when the Steward has said nobody can take the quest (§3.1). */
const statusCell = (ctx: KingdomContext, quest: Quest, unclaimable: ReadonlySet<QuestId>): string => {
  const status = ctx.t(QUEST_STATUS_LABEL[quest.status]);
  return unclaimable.has(quest.id) ? `${status} (${ctx.t('cli.quest.unclaimable.mark')})` : status;
};

interface Board {
  readonly registry: Registry | undefined;
  readonly unclaimable: ReadonlySet<QuestId>;
  /** Every quest read, for where each quest's party stands (P1-21 (c)). */
  readonly quests: readonly Quest[];
}

const questRow = (ctx: KingdomContext, board: Board, quest: Quest): string[] => [
  quest.id,
  statusCell(ctx, quest, board.unclaimable),
  quest.rank,
  kindName(ctx, board.registry, quest.kind),
  partyCell(ctx, quest, board.quests),
  quest.territory,
  quest.assignee ?? NONE,
  quest.title,
];

async function runQuestList(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const statuses = textOptions(input, 'status');
  const unknown = statuses.find((status) => !isStatus(status));
  if (unknown !== undefined) {
    ctx.io.err(
      ctx.t('cli.error.unknown', { option: '--status', value: unknown, choices: QUEST_STATUSES.join(', ') }),
    );
    return EXIT.usage;
  }
  const territory = textOption(input, 'territory');
  const registry = await ctx.store.loadRegistry();
  const { items, issues } = await ctx.store.quests.list();
  const unclaimable = new Set((await unclaimableOf(ctx, items)).keys());
  const board = { registry: registry.ok ? registry.value : undefined, unclaimable, quests: items };
  const shown = items.filter(
    (quest) =>
      (statuses.length === 0 || statuses.includes(quest.status)) &&
      (territory === undefined || quest.territory === territory),
  );
  const code = printListing(ctx, {
    header: [
      'cli.column.id',
      'cli.column.status',
      'cli.column.rank',
      'cli.column.kind',
      'cli.column.party',
      'cli.column.territory',
      'cli.column.assignee',
      'cli.column.title',
    ],
    rows: shown.map((quest) => questRow(ctx, board, quest)),
    issues,
    empty: 'cli.quest.list.none',
  });
  const marked = shown.filter(({ id }) => unclaimable.has(id)).length;
  if (marked > 0) ctx.io.out(ctx.t('cli.quest.unclaimable.hint', { count: marked }));
  const waiting = (await ctx.store.inbox.read()).length;
  if (waiting > 0) ctx.io.out(ctx.t('cli.quest.list.waiting', { count: waiting }));
  return code;
}

export const QUEST_LIST: CommandSpec = {
  name: ['quest', 'list'],
  summary: 'cli.quest.list.summary',
  args: [],
  options: {
    status: { type: 'string', value: '<status>', multiple: true, help: 'cli.quest.list.option.status' },
    territory: { type: 'string', value: '<id>', help: 'cli.quest.list.option.territory' },
  },
  run: runQuestList,
};
