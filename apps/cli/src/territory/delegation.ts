// `elvaria territory delegation <id> [--resume]` (PS-08g, K11; ADR 0023): prints the delegation of the seal as it stands
// on a territory: the kingdom's scope of it (kingdom.delegation.seal), whether the territory merges by itself
// (`pr_merge`, the only mode it covers), and whether the breaker suspended it, since which quest and why
// (sealSuspendedOf over the log). `--resume` asks the Steward to resume it through the inbox (`resume_delegation`, ADR
// 0005); a territory whose delegation is not suspended is refused here, as the Steward would. No mana.
import { TerritoryIdSchema, deliveryOf, sealSuspendedOf } from '@elvaria/domain';
import type { SealSuspension, Territory } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';

import { flagOption } from '../args.ts';
import { EXIT } from '../command-table/command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { commandHeader, sendCommand } from '../quest/send-command.ts';
import { suspensionCause } from './delegation-view.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command-table/command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** The territory's suspension as the log tells it; undefined while its delegation works. */
async function suspensionOn(ctx: KingdomContext, territory: Territory): Promise<SealSuspension | undefined> {
  const { events } = await openEventLog(ctx.store.root).read();
  return sealSuspendedOf(events).find((suspension) => suspension.territory === territory.id);
}

function printScope(ctx: KingdomContext, territory: Territory): void {
  const { t, io } = ctx;
  const { seal } = ctx.kingdom.delegation;
  io.out(
    seal === undefined
      ? t('cli.territory.delegation.off')
      : t('cli.territory.delegation.scope', {
          kinds: seal.kinds.join(', '),
          max_rank: seal.max_rank,
          max_diff_lines: seal.max_diff_lines,
        }),
  );
  const { mode } = deliveryOf(territory);
  const merges =
    mode === 'pr_merge' ? 'cli.territory.delegation.pr_merge' : 'cli.territory.delegation.not_pr_merge';
  io.out(t(merges, { id: territory.id, mode }));
}

function printSuspension(
  ctx: KingdomContext,
  territory: Territory,
  suspension: SealSuspension | undefined,
): void {
  const { t, io } = ctx;
  if (suspension === undefined) {
    io.out(t('cli.territory.delegation.working', { id: territory.id }));
    return;
  }
  const { quest, since } = suspension;
  io.out(t('cli.territory.delegation.suspended', { id: territory.id, since, quest }));
  io.out(t('cli.territory.delegation.cause', { cause: suspensionCause(t, suspension) }));
  io.out(t('cli.territory.delegation.before_resume', { id: territory.id, quest }));
}

async function resume(ctx: KingdomContext, territory: Territory, suspended: boolean): Promise<ExitCode> {
  if (!suspended) {
    ctx.io.err(ctx.t('cli.territory.delegation.not_suspended', { id: territory.id }));
    return EXIT.failed;
  }
  const command = {
    ...commandHeader(ctx),
    kind: 'resume_delegation',
    payload: { territory: territory.id },
  } as const;
  return sendCommand(ctx, command, 'cli.territory.delegation.resume_sent', { id: territory.id });
}

async function runTerritoryDelegation(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const id = TerritoryIdSchema.safeParse(input.positionals[0] ?? '');
  const found = id.success ? await ctx.store.territories.read(id.data) : undefined;
  if (!found?.ok) {
    ctx.io.err(ctx.t('cli.territory.delegation.unknown', { id: input.positionals[0] ?? '' }));
    return EXIT.failed;
  }
  const suspension = await suspensionOn(ctx, found.value);
  if (flagOption(input, 'resume') === true) return resume(ctx, found.value, suspension !== undefined);
  printScope(ctx, found.value);
  printSuspension(ctx, found.value, suspension);
  return EXIT.ok;
}

export const TERRITORY_DELEGATION: CommandSpec = {
  name: ['territory', 'delegation'],
  summary: 'cli.territory.delegation.summary',
  args: [{ name: '<id>', help: 'cli.territory.delegation.arg.id' }],
  options: { resume: { type: 'boolean', help: 'cli.territory.delegation.option.resume' } },
  run: runTerritoryDelegation,
};
