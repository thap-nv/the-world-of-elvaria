// `elvaria character suspend <id> [--reason]` and `elvaria character release <id>` (implementation-plan §2.6, owner's
// decision after P1-26): the owner takes a character off work and brings it back. Inbox commands the Steward applies
// (ADR 0005, steward/src/inbox/character-commands.ts); the CLI checks the character's status first, so a command
// the Steward would refuse is refused at the terminal.
import type { Character } from '@elvaria/domain';

import { textOption } from '../args.ts';
import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { CHARACTER_STATUS_LABEL } from '../labels.ts';
import { commandHeader, sendCommand } from '../quest/send-command.ts';
import { readCharacter } from './read.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** The character the command line names, or undefined once the reasons it cannot be read are printed. */
async function namedCharacter(input: CommandInput, ctx: KingdomContext): Promise<Character | undefined> {
  const character = await readCharacter(ctx, input.positionals[0] ?? '');
  if (!Array.isArray(character)) return character;
  character.forEach(ctx.io.err);
  return undefined;
}

/** What happens to the quest the character holds: the next judge takes a review, a quest goes on without it. */
function heldLines(ctx: KingdomContext, character: Character): string[] {
  const held = character.current ?? undefined;
  if (held === undefined) return [];
  const key =
    held.role === 'verifier' ? 'cli.character.suspend.holds_review' : 'cli.character.suspend.holds_quest';
  return [ctx.t(key, { quest: held.quest })];
}

async function runSuspend(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const character = await namedCharacter(input, ctx);
  if (character === undefined) return EXIT.failed;
  if (character.status === 'suspended') {
    ctx.io.err(ctx.t('cli.character.suspend.already', { character: character.id }));
    return EXIT.failed;
  }
  const reason = textOption(input, 'reason');
  const payload = { character: character.id, ...(reason === undefined ? {} : { reason }) };
  const command = { ...commandHeader(ctx), kind: 'suspend', payload } as const;
  const sent = await sendCommand(ctx, command, 'cli.character.suspend.sent', { character: character.id });
  if (sent === EXIT.ok) heldLines(ctx, character).forEach(ctx.io.out);
  return sent;
}

async function runRelease(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const character = await namedCharacter(input, ctx);
  if (character === undefined) return EXIT.failed;
  if (character.status !== 'suspended') {
    const status = ctx.t(CHARACTER_STATUS_LABEL[character.status]);
    ctx.io.err(ctx.t('cli.character.release.not_suspended', { character: character.id, status }));
    return EXIT.failed;
  }
  const command = { ...commandHeader(ctx), kind: 'release', payload: { character: character.id } } as const;
  return sendCommand(ctx, command, 'cli.character.release.sent', { character: character.id });
}

export const CHARACTER_SUSPEND: CommandSpec = {
  name: ['character', 'suspend'],
  summary: 'cli.character.suspend.summary',
  args: [{ name: '<id>', help: 'cli.character.arg.character' }],
  options: {
    reason: { type: 'string', value: '<text>', help: 'cli.character.suspend.option.reason' },
  },
  run: runSuspend,
};

export const CHARACTER_RELEASE: CommandSpec = {
  name: ['character', 'release'],
  summary: 'cli.character.release.summary',
  args: [{ name: '<id>', help: 'cli.character.arg.character' }],
  options: {},
  run: runRelease,
};
