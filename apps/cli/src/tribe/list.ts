// `elvaria tribe list` (P1-34, implementation-plan §3.14): one line per tribe of kingdom.json — its adapter, on or
// off, the CLI doctor pinned and its sign-in, how far tribeLimitsOf lets it go (highest rank, guarded territories)
// and what its adapter declares, with the shell its sessions run commands in on this OS (P1-46). A tribe whose adapter has no runner yet, or whose adapter file does not load, says
// so in place of what it would declare; `elvaria tribe check` says why a file does not load.
import { ADAPTER_CAPABILITIES, shellOf, tribeLimitsOf } from '@elvaria/domain';
import type { Tribe } from '@elvaria/domain';

import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { NONE, printListing } from '../listing.ts';
import { handOf } from '../run/crew.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** Max rank, guarded territories, declared capabilities and shell of the tribe's runner, or why it has none. */
async function limitCells(ctx: KingdomContext, tribe: Tribe): Promise<string[]> {
  const found = await handOf(tribe, { kingdom: ctx.kingdom, root: ctx.store.root }, ctx.io);
  if (found.kind === 'none') return [NONE, NONE, ctx.t('cli.tribe.list.no_runner'), NONE];
  if (found.kind === 'broken') return [NONE, NONE, ctx.t('cli.tribe.list.broken', { tribe: tribe.id }), NONE];
  const caps = found.hand.runner.capabilities;
  const limits = tribeLimitsOf(caps);
  return [
    // Without `headless` planTick gives the tribe nothing at all (P1-19).
    limits.enabled ? limits.max_rank : NONE,
    ctx.t(limits.guarded_zones ? 'cli.yes' : 'cli.no'),
    ADAPTER_CAPABILITIES.filter((name) => caps[name]).join(', '),
    shellOf(caps, ctx.io.platform) ?? NONE,
  ];
}

async function rowOf(ctx: KingdomContext, tribe: Tribe): Promise<string[]> {
  return [
    tribe.id,
    tribe.adapter,
    ctx.t(tribe.enabled ? 'cli.yes' : 'cli.no'),
    tribe.tool?.version ?? NONE,
    tribe.tool?.auth ?? NONE,
    ...(await limitCells(ctx, tribe)),
    tribe.tool?.path ?? NONE,
  ];
}

async function runTribeList(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  return printListing(ctx, {
    header: [
      'cli.column.id',
      'cli.column.adapter',
      'cli.column.enabled',
      'cli.column.version',
      'cli.column.sign_in',
      'cli.column.max_rank',
      'cli.column.guarded',
      'cli.column.capabilities',
      'cli.column.shell',
      'cli.column.path',
    ],
    rows: await Promise.all(ctx.kingdom.tribes.map((tribe) => rowOf(ctx, tribe))),
    issues: [],
    // kingdom.json holds at least one tribe (schema), so this is never printed.
    empty: 'cli.tribe.list.none',
  });
}

export const TRIBE_LIST: CommandSpec = {
  name: ['tribe', 'list'],
  summary: 'cli.tribe.list.summary',
  args: [],
  options: {},
  run: runTribeList,
};
