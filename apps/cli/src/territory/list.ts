// `elvaria territory list`: the territories attached to the kingdom.
import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { NONE, printListing } from '../listing.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';

async function runTerritoryList(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const { items, issues } = await ctx.store.territories.list();
  return printListing(ctx, {
    header: ['cli.column.id', 'cli.column.name', 'cli.column.kind', 'cli.column.branch', 'cli.column.path'],
    rows: items.map((territory) => [
      territory.id,
      territory.name,
      territory.kind,
      territory.vcs.default_branch ?? NONE,
      territory.path,
    ]),
    issues,
    empty: 'cli.territory.none',
  });
}

export const TERRITORY_LIST: CommandSpec = {
  name: ['territory', 'list'],
  summary: 'cli.territory.list.summary',
  args: [],
  options: {},
  run: runTerritoryList,
};
