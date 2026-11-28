// The character the owner names to work a quest (`quest reassign --to`, `quest add --to`, `quest retry --to`; P1-26,
// P1-29, lessons of 2026-11-12), checked here by the same rule the Steward applies (namedAssignee): a wrong name is
// refused at the terminal, not a tick later.
import { aboveCeiling, namedAssignee, rankCeilingOf } from '@elvaria/domain';
import type {
  Character,
  CharacterId,
  InboxCommandInput,
  NamedAssigneeProblem,
  Quest,
  Rank,
} from '@elvaria/domain';
import type { MessageKey } from '@elvaria/i18n';

import { readCharacter } from '../character/read.ts';
import { EXIT } from '../command-table/command.ts';
import { nameIn } from '../labels.ts';
import { commandHeader, sendCommand } from './send-command.ts';
import type { ExitCode } from '../command-table/command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

const PROBLEM_LINE: Record<NamedAssigneeProblem, MessageKey> = {
  unknown_character: 'cli.character.unknown',
  class_mismatch: 'cli.quest.assignee.class_mismatch',
  character_suspended: 'cli.quest.assignee.suspended',
  tribe_disabled: 'cli.quest.assignee.tribe_disabled',
};

/** A class by its name in the owner's language, or its id when the registry does not load. */
export async function classNames(ctx: KingdomContext): Promise<(id: string) => string> {
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

/**
 * Sends the command `build` writes for the character `to` names, once checked; then says when the quest will wait
 * for the seal. Every command that hands a quest to a named character goes through here (`quest confirm --to`,
 * `reassign --to`, `retry --to`), so they check and answer alike (AH-14a). `sent` is the line that says it went.
 */
export async function sendForCharacter(
  ctx: KingdomContext,
  quest: Quest,
  to: string,
  sent: MessageKey,
  build: (character: CharacterId) => InboxCommandInput,
): Promise<ExitCode> {
  // A session-tier quest (the only kind these commands take) always names its class.
  const character = await assigneeFor(ctx, to, quest.class_required);
  if (Array.isArray(character)) {
    character.forEach(ctx.io.err);
    return EXIT.failed;
  }
  const code = await sendCommand(ctx, build(character.id), sent, { id: quest.id, character: character.id });
  if (code === EXIT.ok) ceilingLines(ctx, character, quest.rank).forEach(ctx.io.out);
  return code;
}

/** Sends the `reassign` command that gives `quest` to the character `to` names (§2.5). */
export const giveQuestTo = (
  ctx: KingdomContext,
  quest: Quest,
  to: string,
  sent: MessageKey,
): Promise<ExitCode> =>
  sendForCharacter(ctx, quest, to, sent, (character) => ({
    ...commandHeader(ctx),
    kind: 'reassign',
    payload: { quest: quest.id, character },
  }));
