// The character a command names, read before the command is sent: the Steward would refuse an unknown one a tick
// later, and the owner is still at the terminal now. The CLI reads character files, never writes one it did not
// create (ADR 0005).
import { CharacterIdSchema } from '@elvaria/domain';
import type { Character } from '@elvaria/domain';

import { storeIssueLines } from '../issues.ts';
import type { CommandInput } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** The character file, or the lines that say why it cannot be read. */
export async function readCharacter(ctx: KingdomContext, id: string): Promise<Character | string[]> {
  const unknown = [ctx.t('cli.character.unknown', { character: id })];
  const parsed = CharacterIdSchema.safeParse(id);
  if (!parsed.success) return unknown;
  const read = await ctx.store.characters.read(parsed.data);
  if (read.ok) return read.value;
  return read.error.code === 'not_found' ? unknown : storeIssueLines(ctx.t, read.error);
}

/**
 * The character the command line names first (`character <verb> <id> …`), or undefined once the reasons it cannot
 * be read are printed.
 */
export async function namedCharacter(
  input: CommandInput,
  ctx: KingdomContext,
): Promise<Character | undefined> {
  const character = await readCharacter(ctx, input.positionals[0] ?? '');
  if (!Array.isArray(character)) return character;
  character.forEach(ctx.io.err);
  return undefined;
}
