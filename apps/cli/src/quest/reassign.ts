// `elvaria quest reassign <quest> [--to <character>]`: the owner gives a quest to someone (implementation-plan §2.5
// `reassign`, P1-26). With --to, to that character, its level aside: canTake bounds only the Steward's own choice,
// and above the character's ceiling the quest waits for the royal seal (§2.6). Without it, the Steward picks among
// the free characters of the class, other than the one holding it. An inbox command like the rest (ADR 0005); the
// CLI checks the character first, so a wrong name is refused at the terminal and not one tick later.
import { aboveCeiling, rankCeilingOf } from '@elvaria/domain';
import type { Character, Quest } from '@elvaria/domain';

import { textOption } from '../args.ts';
import { readCharacter } from '../character/read.ts';
import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { nameIn } from '../labels.ts';
import { questFor } from './lifecycle.ts';
import { commandHeader, sendCommand } from './send-command.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** A class by its name in the owner's language, or its id when the registry does not load. */
async function classNames(ctx: KingdomContext): Promise<(id: string) => string> {
  const registry = await ctx.store.loadRegistry();
  return (id) => {
    const entry = registry.ok ? registry.value.classes.find((candidate) => candidate.id === id) : undefined;
    return entry === undefined ? id : nameIn(ctx.locale, entry);
  };
}

/** The character `--to` names, if it may take the quest (as the Steward checks it): known, of the class, not suspended. */
async function characterFor(ctx: KingdomContext, quest: Quest, id: string): Promise<Character | string[]> {
  const character = await readCharacter(ctx, id);
  if (Array.isArray(character)) return character;
  // A session-tier quest (the only kind reassign takes) always names its class.
  const required = quest.class_required ?? '';
  if (character.class !== required) {
    const className = await classNames(ctx);
    const params = { character: id, class: className(character.class), required: className(required) };
    return [ctx.t('cli.quest.reassign.class_mismatch', { ...params, id: quest.id })];
  }
  if (character.status === 'suspended') return [ctx.t('cli.quest.reassign.suspended', { character: id })];
  return character;
}

async function runReassign(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const quest = await questFor(input, ctx, () => 'reassign', 'cli.quest.reassign.refused');
  if (quest === undefined) return EXIT.failed;
  const to = textOption(input, 'to');
  if (to === undefined) {
    const command = { ...commandHeader(ctx), kind: 'reassign', payload: { quest: quest.id } } as const;
    return sendCommand(ctx, command, 'cli.quest.reassign.sent', { id: quest.id });
  }
  const character = await characterFor(ctx, quest, to);
  if (Array.isArray(character)) {
    character.forEach(ctx.io.err);
    return EXIT.failed;
  }
  const payload = { quest: quest.id, character: character.id };
  const sent = await sendCommand(
    ctx,
    { ...commandHeader(ctx), kind: 'reassign', payload },
    'cli.quest.reassign.sent_to',
    {
      id: quest.id,
      character: character.id,
    },
  );
  if (sent === EXIT.ok && aboveCeiling(character.level, quest.rank)) {
    const { level } = character;
    const params = { character: character.id, level, ceiling: rankCeilingOf(level), rank: quest.rank };
    ctx.io.out(ctx.t('cli.quest.reassign.above_ceiling', params));
  }
  return sent;
}

export const QUEST_REASSIGN: CommandSpec = {
  name: ['quest', 'reassign'],
  summary: 'cli.quest.reassign.summary',
  args: [{ name: '<quest>', help: 'cli.quest.arg.quest' }],
  options: { to: { type: 'string', value: '<character>', help: 'cli.quest.reassign.option.to' } },
  run: runReassign,
};
