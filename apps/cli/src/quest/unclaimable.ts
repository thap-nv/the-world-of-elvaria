// Quests nobody can take (implementation-plan §3.1 "Quest không ai nhận được"): the Steward keeps its notices in
// `.state/unclaimable.json`; `quest list` marks those quests and `quest show` says why, with the commands that
// would change it: lower the rank, summon a character of the class, or cancel the quest.
import { CHARACTER_LEVEL_MAX, RANKS, canTake, rankCeilingOf } from '@elvaria/domain';
import { readUnclaimable } from '@elvaria/steward';
import type { Quest, QuestId, Rank, Registry } from '@elvaria/domain';
import type { UnclaimableNote } from '@elvaria/steward';

import { nameIn } from '../labels.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** The notices in force for open quests; a notice outlives its quest only until the Steward's next tick. */
export async function unclaimableOf(
  ctx: KingdomContext,
  quests: readonly Quest[],
): Promise<Map<QuestId, UnclaimableNote>> {
  const notes = await readUnclaimable(ctx.store.root);
  const open = new Set(quests.filter(({ status }) => status === 'open').map(({ id }) => id));
  return new Map([...notes].filter(([id]) => open.has(id)));
}

/** The lowest level that takes `rank` as a matter of course (§2.6): what to summon. */
const levelFor = (rank: Rank): number =>
  Array.from({ length: CHARACTER_LEVEL_MAX }, (_, index) => index + 1).find((level) =>
    canTake(level, rank, false),
  ) ?? CHARACTER_LEVEL_MAX;

/** The rank one above `ceiling`: taken only when nobody else can. */
const stretchOf = (ceiling: Rank): Rank =>
  RANKS[Math.min(RANKS.indexOf(ceiling) + 1, RANKS.length - 1)] ?? ceiling;

const className = (ctx: KingdomContext, registry: Registry | undefined, id: string): string => {
  const entry = registry?.classes.find((candidate) => candidate.id === id);
  return entry === undefined ? id : nameIn(ctx.locale, entry);
};

async function characterName(ctx: KingdomContext, id: string): Promise<string> {
  const read = await ctx.store.characters.read(id as never);
  return read.ok ? read.value.name : id;
}

/** Why the quest waits, then what the owner can do about it, one line each. */
export async function unclaimableLines(
  ctx: KingdomContext,
  registry: Registry | undefined,
  quest: Quest,
  note: UnclaimableNote,
): Promise<string[]> {
  const cls = className(ctx, registry, note.class);
  const summon = `elvaria character add <id> --class ${note.class} --level ${levelFor(note.rank)}`;
  if (note.reason === 'level_too_low' && note.best_character !== undefined && note.best_level !== undefined) {
    const ceiling = rankCeilingOf(note.best_level);
    return [
      ctx.t('cli.quest.unclaimable.level_too_low', {
        rank: note.rank,
        class: cls,
        character: await characterName(ctx, note.best_character),
        level: note.best_level,
        ceiling,
        stretch: stretchOf(ceiling),
      }),
      ctx.t('cli.quest.unclaimable.lower_rank', {
        command: `elvaria quest edit ${quest.id} --rank ${ceiling}`,
      }),
      ctx.t('cli.quest.unclaimable.summon', { command: summon }),
    ];
  }
  return [
    ctx.t('cli.quest.unclaimable.no_class', { class: cls }),
    ctx.t('cli.quest.unclaimable.summon', { command: summon }),
    ctx.t('cli.quest.unclaimable.cancel', { command: `elvaria quest cancel ${quest.id}` }),
  ];
}
