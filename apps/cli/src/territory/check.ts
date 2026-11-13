// `elvaria territory check <id>` (PS-25, implementation-plan §3.16.1): is the territory ready for characters? It tries
// commands.setup and every check on a clean plot at the head of the default branch (runner-core's tryTerritory: a
// detached worktree, removed after), reads the metrics ledger and the gazetteer, and prints the territory's
// scorecard (the domain's territoryScorecardOf). Exit 1 when the trial fails. It writes no quest and no event, calls
// no model, and keeps how the card stood in `.state/territory-trials/<id>.json` for `doctor` (trial-record.ts).
import { metricsOf, territoryScorecardOf } from '@elvaria/domain';
import type { Territory } from '@elvaria/domain';
import { gazetteerStampOf, tryTerritory } from '@elvaria/runner-core';
import type { TerritoryTrialRun } from '@elvaria/runner-core';
import { inKingdom, kingdomLayout, readTextFile } from '@elvaria/store';

import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { readMetricsSource } from '../metrics/read.ts';
import { processHostOf } from '../run/plots.ts';
import { scorecardLines } from './check-view.ts';
import { recordOf, writeTrialRecord } from './trial-record.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** The trial, stopped by Ctrl+C: the running command is killed and the plot still removed. */
async function trialOf(
  ctx: KingdomContext,
  territory: Territory,
  stamp: string | undefined,
  signal: AbortSignal,
): Promise<TerritoryTrialRun> {
  ctx.io.out(
    ctx.t('cli.territory.check.trying', { id: territory.id, branch: territory.vcs.default_branch ?? '' }),
  );
  return tryTerritory({
    kingdom: ctx.store.root,
    territory,
    host: processHostOf(ctx.io),
    platform: ctx.io.platform,
    signal,
    ...(stamp === undefined ? {} : { stamp }),
  });
}

async function runTerritoryCheck(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const { t, io } = ctx;
  const id = input.positionals[0] ?? '';
  const territory = (await ctx.store.territories.list()).items.find((item) => item.id === id);
  if (territory === undefined) {
    io.err(t('cli.territory.check.unknown', { id }));
    return EXIT.failed;
  }
  const root = ctx.store.root;
  const text = (await readTextFile(inKingdom(root, kingdomLayout.gazetteer(territory.id)))) ?? null;
  const stamp = text === null ? undefined : gazetteerStampOf(text);
  const stop = new AbortController();
  void io.untilStopped().then(() => {
    stop.abort();
  });
  const run = territory.vcs.type === 'git' ? await trialOf(ctx, territory, stamp, stop.signal) : undefined;
  if (run?.leftover !== undefined) io.err(t('cli.territory.check.leftover', { detail: run.leftover }));
  if (stop.signal.aborted) {
    io.err(t('cli.territory.check.stopped'));
    return EXIT.failed;
  }
  const { input: ledger } = await readMetricsSource(root);
  const card = territoryScorecardOf({
    territory,
    metrics: metricsOf(ledger),
    trial: run?.trial ?? null,
    gazetteer: {
      text,
      ...(stamp === undefined ? {} : { stamp }),
      ...(run?.commits_since === undefined ? {} : { commits_since: run.commits_since }),
    },
  });
  for (const line of scorecardLines(t, card, territory.vcs.default_branch ?? '')) io.out(line);
  await writeTrialRecord(root, recordOf(territory, card, ctx.now()));
  return card.items[0]?.status === 'fail' ? EXIT.failed : EXIT.ok;
}

export const TERRITORY_CHECK: CommandSpec = {
  name: ['territory', 'check'],
  summary: 'cli.territory.check.summary',
  args: [{ name: '<id>', help: 'cli.territory.check.arg.id' }],
  options: {},
  run: runTerritoryCheck,
};
