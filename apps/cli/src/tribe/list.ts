// `elvaria tribe list` (P1-34, implementation-plan §3.14): one line per tribe of kingdom.json — its look (PS-24: the
// name, and the palette and crest that tell it apart; `elvaria tribe look` shows the rest), its adapter, on or
// off, the CLI doctor pinned and its sign-in, how far tribeLimitsOf lets it go (highest rank, guarded territories)
// and what its adapter declares, with the shell its sessions run commands in on this OS (P1-46) and the longest
// user prompt its CLI takes here (fix/cli-lines, (97)). A tribe whose adapter has no runner yet, or whose adapter
// file does not load, says so in place of what it would declare; `elvaria tribe check` says why a file does not load.
import { ADAPTER_CAPABILITIES, promptMaxOf, shellOf, tribeLimitsOf, tribeLookOf } from '@elvaria/domain';
import type { Tribe, TribeLookPool } from '@elvaria/domain';

import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { NONE, printListing } from '../listing.ts';
import { handOf } from '../run/crew.ts';
import { kingdomPool, lookCellOf } from './look-view.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** Max rank, guarded territories, declared capabilities, shell and prompt limit of the tribe's runner, or why none. */
async function limitCells(ctx: KingdomContext, tribe: Tribe): Promise<string[]> {
  const found = await handOf(tribe, { kingdom: ctx.kingdom, root: ctx.store.root }, ctx.io);
  if (found.kind === 'none') return [NONE, NONE, ctx.t('cli.tribe.list.no_runner'), NONE, NONE];
  if (found.kind === 'broken')
    return [NONE, NONE, ctx.t('cli.tribe.list.broken', { tribe: tribe.id }), NONE, NONE];
  const caps = found.hand.runner.capabilities;
  const limits = tribeLimitsOf(caps);
  return [
    // Without `headless` planTick gives the tribe nothing at all (P1-19).
    limits.enabled ? limits.max_rank : NONE,
    ctx.t(limits.guarded_zones ? 'cli.yes' : 'cli.no'),
    ADAPTER_CAPABILITIES.filter((name) => caps[name]).join(', '),
    shellOf(caps, ctx.io.platform) ?? NONE,
    String(promptMaxOf(caps, ctx.io.platform) ?? NONE),
  ];
}

async function rowOf(ctx: KingdomContext, pool: TribeLookPool | undefined, tribe: Tribe): Promise<string[]> {
  return [
    tribe.id,
    pool === undefined ? NONE : lookCellOf(ctx.t, tribeLookOf(pool, ctx.kingdom.tribes, tribe.id)),
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
  // A theme without a look pool leaves the column empty; tribe look says why.
  const pool = kingdomPool(ctx, true);
  return printListing(ctx, {
    header: [
      'cli.column.id',
      'cli.column.look',
      'cli.column.adapter',
      'cli.column.enabled',
      'cli.column.version',
      'cli.column.sign_in',
      'cli.column.max_rank',
      'cli.column.guarded',
      'cli.column.capabilities',
      'cli.column.shell',
      'cli.column.prompt_max',
      'cli.column.path',
    ],
    rows: await Promise.all(ctx.kingdom.tribes.map((tribe) => rowOf(ctx, pool, tribe))),
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
