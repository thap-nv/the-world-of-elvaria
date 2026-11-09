// `elvaria tribe disable <id>` (implementation-plan §3.14 step 7): the tribe takes no new work. Its running quests
// finish, and its quests paused for mana wait as when the mana runs out (the owner may reassign them); its
// characters keep their tribe for life. `elvaria tribe check` enables it again.
import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { namedTribe, setEnabled } from './save.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';

async function runDisable(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const tribe = namedTribe(ctx, input.positionals[0]);
  if (tribe === undefined) return EXIT.failed;
  if (!tribe.enabled) {
    ctx.io.out(ctx.t('cli.tribe.disable.already', { tribe: tribe.id }));
    return EXIT.ok;
  }
  if (!(await setEnabled(ctx, tribe, false))) return EXIT.failed;
  ctx.io.out(ctx.t('cli.tribe.disable.done', { tribe: tribe.id }));
  return EXIT.ok;
}

export const TRIBE_DISABLE: CommandSpec = {
  name: ['tribe', 'disable'],
  summary: 'cli.tribe.disable.summary',
  args: [{ name: '<id>', help: 'cli.tribe.arg.tribe' }],
  options: {},
  run: runDisable,
};
