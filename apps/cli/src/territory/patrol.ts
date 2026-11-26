// `elvaria territory patrol <id> [--on|--off]` (PS-26): prints whether the Steward's daily patrol watches a territory's
// default branch, or turns it on or off. The CLI writes territory.json itself, as `territory delivery` does (ADR 0005,
// .claude/rules/cli.md): a territory is settings the Steward reads again at each tick, so the change counts from the
// next patrol. `--on` keeps the scans and follow_up already there; `--off` removes `patrol`, them included. Scans and
// follow_up are edited in the file (docs/guides/operating-a-kingdom.md). No event, no mana. (PS-09d) `--now` asks the
// Steward for one patrol of the territory now, through the inbox (`patrol`): after the owner fixed a red branch by
// hand, or for a flaky check, so the territory takes work again without waiting for the next day's patrol.
import { TerritoryIdSchema, ok } from '@elvaria/domain';
import type { Territory } from '@elvaria/domain';

import { flagOption } from '../args.ts';
import { EXIT } from '../command-table/command.ts';
import { storeIssueLines } from '../issues.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { commandHeader, sendCommand } from '../quest/send-command.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command-table/command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

function printPatrol(ctx: KingdomContext, territory: Territory): void {
  const { t, io } = ctx;
  const { id, patrol } = territory;
  io.out(t(patrol === undefined ? 'cli.territory.patrol.off' : 'cli.territory.patrol.on', { id }));
  if (territory.vcs.type !== 'git') io.out(t('cli.territory.patrol.no_git'));
  if (patrol !== undefined) {
    const scans = patrol.scans.map(({ script }) => script).join(', ');
    io.out(
      t('cli.territory.patrol.scans', { scans: scans === '' ? t('cli.territory.patrol.no_scans') : scans }),
    );
    const followUp = patrol.follow_up;
    io.out(
      followUp === undefined
        ? t('cli.territory.patrol.no_follow_up')
        : t('cli.territory.patrol.follow_up', {
            kind: followUp.kind,
            rank: followUp.rank,
            class: followUp.class,
          }),
    );
  }
  const { enabled, every, at } = ctx.kingdom.schedule.patrol;
  io.out(
    enabled ? t('cli.territory.patrol.schedule', { every, at }) : t('cli.territory.patrol.schedule_off'),
  );
  io.out(t('cli.territory.patrol.edit_hint'));
}

/** Writes the flag under the store's lock, keeping whatever else changed on disk meanwhile. */
async function save(ctx: KingdomContext, territory: Territory, on: boolean): Promise<Territory | undefined> {
  const written = await ctx.store.territories.update(territory.id, (current) => {
    const { patrol, ...rest } = current;
    return ok(on ? { ...rest, patrol: patrol ?? { scans: [] } } : rest);
  });
  if (written.ok) return written.value;
  storeIssueLines(ctx.t, written.error).forEach(ctx.io.err);
  return undefined;
}

/** `--now`: one patrol now, for a territory the patrol watches. */
async function patrolNow(ctx: KingdomContext, territory: Territory): Promise<ExitCode> {
  const { id, patrol, vcs } = territory;
  if (patrol === undefined || vcs.type !== 'git') {
    ctx.io.err(ctx.t('cli.territory.patrol.now_off', { id }));
    return EXIT.failed;
  }
  const command = { ...commandHeader(ctx), kind: 'patrol', payload: { territory: id } } as const;
  return sendCommand(ctx, command, 'cli.territory.patrol.now_sent', { id });
}

async function runTerritoryPatrol(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const { t, io } = ctx;
  const id = TerritoryIdSchema.safeParse(input.positionals[0] ?? '');
  const found = id.success ? await ctx.store.territories.read(id.data) : undefined;
  if (!found?.ok) {
    io.err(t('cli.territory.patrol.unknown', { id: input.positionals[0] ?? '' }));
    return EXIT.failed;
  }
  const on = flagOption(input, 'on') === true;
  const off = flagOption(input, 'off') === true;
  const now = flagOption(input, 'now') === true;
  if (now && (on || off)) {
    io.err(t('cli.territory.patrol.now_alone'));
    return EXIT.usage;
  }
  if (now) return patrolNow(ctx, found.value);
  if (on && off) {
    io.err(t('cli.territory.patrol.both'));
    return EXIT.usage;
  }
  if (!on && !off) {
    printPatrol(ctx, found.value);
    return EXIT.ok;
  }
  const saved = await save(ctx, found.value, on);
  if (saved === undefined) return EXIT.failed;
  printPatrol(ctx, saved);
  io.out(t('cli.territory.patrol.saved'));
  return EXIT.ok;
}

export const TERRITORY_PATROL: CommandSpec = {
  name: ['territory', 'patrol'],
  summary: 'cli.territory.patrol.summary',
  args: [{ name: '<id>', help: 'cli.territory.patrol.arg.id' }],
  options: {
    on: { type: 'boolean', help: 'cli.territory.patrol.option.on' },
    off: { type: 'boolean', help: 'cli.territory.patrol.option.off' },
    now: { type: 'boolean', help: 'cli.territory.patrol.option.now' },
  },
  run: runTerritoryPatrol,
};
