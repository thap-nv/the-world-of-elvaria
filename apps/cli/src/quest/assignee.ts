// The character the owner names to work a quest (`quest reassign --to`, `quest add --to`; P1-26, P1-29), checked here
// by the same rule the Steward applies (namedAssignee): a wrong name is refused at the terminal, not a tick later.
import { aboveCeiling, namedAssignee, rankCeilingOf } from '@elvaria/domain';
import type { Character, NamedAssigneeProblem, Rank } from '@elvaria/domain';
import type { MessageKey } from '@elvaria/i18n';

import { readCharacter } from '../character/read.ts';
import { nameIn } from '../labels.ts';
import type { KingdomContext } from '../kingdom-context.ts';

const PROBLEM_LINE: Record<NamedAssigneeProblem, MessageKey> = {
  unknown_character: 'cli.character.unknown',
  class_mismatch: 'cli.quest.assignee.class_mismatch',
  character_suspended: 'cli.quest.assignee.suspended',
  tribe_disabled: 'cli.quest.assignee.tribe_disabled',
};

/** A class by its name in the owner's language, or its id when the registry does not load. */
async function classNames(ctx: KingdomContext): Promise<(id: string) => string> {
  const registry = await ctx.store.loadRegistry();
  return (id) => {
    const entry = registry.ok ? registry.value.classes.find((candidate) => candidate.id === id) : undefined;
    return entry === undefined ? id : nameIn(ctx.locale, entry);
  };
}

/**
 * The character `id` names, when it may take a quest needing `required`: known, of the class, not suspended, of an
 * enabled tribe. Otherwise the lines that say why.
 */
export async function assigneeFor(
  ctx: KingdomContext,
  id: string,
  required: string | undefined,
): Promise<Character | string[]> {
  const character = await readCharacter(ctx, id);
  if (Array.isArray(character)) return character;
  const named = namedAssignee(required, character, ctx.kingdom.tribes);
  if (named.ok) return named.value;
  const className = await classNames(ctx);
  const params = {
    character: id,
    class: className(character.class),
    required: className(required ?? ''),
    tribe: character.tribe,
  };
  return [ctx.t(PROBLEM_LINE[named.error.code], params)];
}

/** Above the character's ceiling the quest waits for the royal seal (§2.6): said once the command is sent. */
export function ceilingLines(ctx: KingdomContext, character: Character, rank: Rank): string[] {
  if (!aboveCeiling(character.level, rank)) return [];
  const { level } = character;
  const params = { character: character.id, level, ceiling: rankCeilingOf(level), rank };
  return [ctx.t('cli.quest.assignee.above_ceiling', params)];
}
