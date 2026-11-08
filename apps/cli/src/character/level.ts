// `elvaria character level <id> <level>` (implementation-plan §2.6, P1-29): the owner sets a character's level, up
// or down, e.g. a character summoned at level 1 before levels came from the model. An inbox command the Steward
// applies (set_level, ADR 0005; steward/src/inbox/character-settings.ts); the CLI checks the character and the level
// first, so a command the Steward would refuse is refused at the terminal.
import { CHARACTER_LEVEL_MAX, rankCeilingOf } from '@elvaria/domain';

import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { commandHeader, sendCommand } from '../quest/send-command.ts';
import { namedCharacter } from './read.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';

/** A level of the table (1–10) written as a whole number, or undefined. */
export function levelOfText(text: string): number | undefined {
  const level = Number(text);
  return /^\d+$/.test(text) && level >= 1 && level <= CHARACTER_LEVEL_MAX ? level : undefined;
}

async function runLevel(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const level = levelOfText(input.positionals[1] ?? '');
  if (level === undefined) {
    ctx.io.err(ctx.t('cli.character.bad_level', { max: CHARACTER_LEVEL_MAX }));
    return EXIT.failed;
  }
  const character = await namedCharacter(input, ctx);
  if (character === undefined) return EXIT.failed;
  if (character.level === level) {
    ctx.io.err(ctx.t('cli.character.level.same', { character: character.id, level }));
    return EXIT.failed;
  }
  const payload = { character: character.id, level };
  const command = { ...commandHeader(ctx), kind: 'set_level', payload } as const;
  const params = { character: character.id, from: character.level, level, ceiling: rankCeilingOf(level) };
  return sendCommand(ctx, command, 'cli.character.level.sent', params);
}

export const CHARACTER_LEVEL: CommandSpec = {
  name: ['character', 'level'],
  summary: 'cli.character.level.summary',
  args: [
    { name: '<id>', help: 'cli.character.arg.character' },
    { name: '<level>', help: 'cli.character.level.arg.level' },
  ],
  options: {},
  run: runLevel,
};
