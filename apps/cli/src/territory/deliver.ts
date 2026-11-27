// `elvaria territory deliver <id>` (CM-08, ADR 0032, plans/check-modes.md "Tàu giao hàng"): the owner sends a
// `deferred` territory's delivery train off now, through the inbox (`deliver` naming the territory, ADR 0005), without
// waiting for it to fill or for its first quest's max_wait_minutes. The Steward sends it off at its next tick with the
// quests on its platform or, the platform empty, as soon as a quest boards it; the order ends with that train's
// `train.ran`. The CLI refuses what the Steward surely would (an unknown territory, one not `deferred`); the Steward
// answers the rest (a train of the territory running now). A quest whose delivery failed (a red train) boards again by
// `elvaria quest deliver <quest>`. No mana.
import { TerritoryIdSchema, checkPolicyOf } from '@elvaria/domain';

import { EXIT } from '../command-table/command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { commandHeader, sendCommand } from '../quest/send-command.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command-table/command.ts';

async function runTerritoryDeliver(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const { t, io } = ctx;
  const id = TerritoryIdSchema.safeParse(input.positionals[0] ?? '');
  const found = id.success ? await ctx.store.territories.read(id.data) : undefined;
  if (!found?.ok) {
    io.err(t('cli.territory.deliver.unknown', { id: input.positionals[0] ?? '' }));
    return EXIT.failed;
  }
  const territory = found.value;
  const { mode } = checkPolicyOf(territory);
  if (mode !== 'deferred') {
    io.err(t('cli.territory.deliver.not_deferred', { id: territory.id, mode }));
    return EXIT.failed;
  }
  const command = { ...commandHeader(ctx), kind: 'deliver', payload: { territory: territory.id } } as const;
  return sendCommand(ctx, command, 'cli.territory.deliver.sent', { id: territory.id });
}

export const TERRITORY_DELIVER: CommandSpec = {
  name: ['territory', 'deliver'],
  summary: 'cli.territory.deliver.summary',
  args: [{ name: '<id>', help: 'cli.territory.deliver.arg.id' }],
  options: {},
  run: runTerritoryDeliver,
};
