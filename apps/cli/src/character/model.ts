// `elvaria character model <id> <model>` (implementation-plan §2.3, §3.5, P1-22): the owner moves a character to
// another model of its own tribe, e.g. off Argon while Argon's weekly cap sleeps. An inbox command the Steward
// applies (set_model, ADR 0005; steward/src/inbox/character-settings.ts); the CLI checks the character and the model
// as the Steward does (setModelLine), so a command it would refuse is refused at the terminal.
import { ModelSlugSchema, poolEnabled, poolKeyOf, setModelLine } from '@elvaria/domain';

import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { commandHeader, sendCommand } from '../quest/send-command.ts';
import { namedCharacter } from './read.ts';
import { declaredModelsOf } from './served.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';

async function runModel(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const model = input.positionals[1] ?? '';
  if (!ModelSlugSchema.safeParse(model).success) {
    ctx.io.err(ctx.t('cli.character.bad_model', { model }));
    return EXIT.failed;
  }
  const character = await namedCharacter(input, ctx);
  if (character === undefined) return EXIT.failed;
  const { tribes } = ctx.kingdom;
  // A tribe whose adapter declares its models takes only those, as the Steward's set_model (PS-23).
  const tribe = tribes.find(({ id }) => id === character.tribe);
  const declared = tribe === undefined ? undefined : await declaredModelsOf(tribe, ctx);
  const line = setModelLine(character, model, tribes, declared);
  if (!line.ok) {
    const params = { character: character.id, model, tribe: character.tribe };
    ctx.io.err(ctx.t(`cli.character.model.${line.error.code}`, params));
    return EXIT.failed;
  }
  // A model of a pool the owner turned off is the tribe's, but the character takes no work there until it is on.
  const key = poolKeyOf(tribes, { tribe: character.tribe, model });
  if (!poolEnabled(tribes, key)) ctx.io.out(ctx.t('cli.character.model.pool_off', { ...key, model }));
  const payload = { character: character.id, model };
  const command = { ...commandHeader(ctx), kind: 'set_model', payload } as const;
  const params = { character: character.id, from: character.model, model, level: character.level };
  return sendCommand(ctx, command, 'cli.character.model.sent', params);
}

export const CHARACTER_MODEL: CommandSpec = {
  name: ['character', 'model'],
  summary: 'cli.character.model.summary',
  args: [
    { name: '<id>', help: 'cli.character.arg.character' },
    { name: '<model>', help: 'cli.character.model.arg.model' },
  ],
  options: {},
  run: runModel,
};
