// `elvaria run`: the Steward of one kingdom, until the owner stops it (implementation-plan §3.1; P1-09 row,
// "(Chốt sau P1-03)"). This is where the work engine is put together: a runner per tribe from its adapter, plots
// over PlotManager, the console and desktop bells and the digest file (PS-03), the Chancellor's triage (PS-03b), the amendments'
// authors (PS-22b), the forges a done quest is delivered to (PS-08c), the newer build the digest offers (PS-08d), the
// event log; the Steward itself sees only
// interfaces (ADR 0006, 0021).
import { openEventLog } from '@elvaria/eventlog';
import { minimalEnv, openFileTreasury } from '@elvaria/runner-core';
import { createSteward, nodeScriptRunner } from '@elvaria/steward';
import { fromPortable } from '@elvaria/store';
import type { CodeGraphs } from '@elvaria/runner-core';
import type { Forges, Steward } from '@elvaria/steward';

import { runBell } from '../bell/run-bell.ts';
import { bellRegistered } from '../bell/registration.ts';
import { EXIT } from '../command-table/command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { upgradeOffer } from '../upgrade/offer.ts';
import { runningLine } from '../upgrade/running.ts';
import { consoleBell } from './bell.ts';
import { crewOf } from './crew.ts';
import { fileDigest } from './digest-file.ts';
import { forgesOf } from './forges.ts';
import { graphsOf } from './graphs.ts';
import { plotsOf } from './plots.ts';
import { toolFoundOf } from './tool-found.ts';
import { triageJob } from '../triage/job.ts';
import { amendmentJob } from '../amend/job.ts';
import { templeJob } from '../temple/job.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command-table/command.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Crew } from './crew.ts';

/** Which tribes work and which wait for an adapter, before the first tick. */
function reportCrew(ctx: KingdomContext, crew: Crew): void {
  for (const tribe of ctx.kingdom.tribes.filter(({ id }) => crew.runners[id] !== undefined)) {
    ctx.io.out(ctx.t('cli.run.tribe_ready', { tribe: tribe.id, adapter: tribe.adapter }));
  }
  for (const tribe of crew.idle) {
    ctx.io.out(ctx.t('cli.run.tribe_idle', { tribe: tribe.id, adapter: tribe.adapter }));
  }
  for (const { tribe, problems } of crew.broken) {
    ctx.io.err(ctx.t('cli.run.tribe_broken', { tribe: tribe.id, adapter: tribe.adapter }));
    problems.forEach((problem) => {
      ctx.io.err(`    ${problem}`);
    });
  }
}

interface Found {
  readonly graphs: CodeGraphs | undefined;
  readonly forges: Forges | undefined;
}

function stewardOf(
  ctx: KingdomContext,
  crew: Crew,
  { graphs, forges }: Found,
  desktopBell: boolean,
  registered: boolean,
): Steward {
  const { io, t, store } = ctx;
  return createSteward({
    store,
    events: openEventLog(store.root),
    runners: crew.runners,
    plots: plotsOf(store.root, io, crew.forget),
    // The territories' code graphs (PS-21): none without a pinned graphify.
    ...(graphs === undefined ? {} : { graphs }),
    // Where a done quest's branch goes on a territory that delivers to its forge (PS-08c); none without git.
    ...(forges === undefined ? {} : { forges }),
    // Every session starts from the minimal env and takes only its quest's secrets from the treasury (ADR 0013).
    env: minimalEnv(io.env),
    treasury: openFileTreasury(fromPortable(ctx.kingdom.paths.treasury, io.platform)),
    clock: io.clock,
    ids: ctx.ids,
    // Catalog scripts run on the node found for Elvaria, with the same minimal env and no secret (§3.12).
    scripts: nodeScriptRunner(io.nodePath),
    // The console bell, and the desktop one beside it (P2-03).
    bell: runBell(ctx, consoleBell(t, io), desktopBell, registered),
    // The digest, once a day at kingdom.schedule.digest.at, in the owner's language (PS-03).
    digest: fileDigest(t, store.root, ctx.kingdom.name),
    // A newer build than the pinned one, read as the digest is made (PS-08d).
    upgradeOffer: () => upgradeOffer(io, store.root),
    // The Chancellor's triage of the memos waiting, before the digest, outside the tick (PS-03b).
    jobs: [triageJob(ctx, crew.runners)],
    // An amendment's author, whenever a quest waits on one (PS-22b); the Temple, whenever it is due (PS-12f).
    onCall: [amendmentJob(ctx, crew.runners), templeJob(ctx, crew.runners)],
    // Each tribe's CLI asked before the plan: one gone or changed since its last real check is held (A1b).
    toolFound: toolFoundOf(ctx.kingdom, crew.runners, io),
    log: {
      info: (message) => {
        io.out(message);
      },
      warn: (message) => {
        io.err(t('cli.run.warning', { message }));
      },
    },
  });
}

async function runSteward(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const { io, t, store } = ctx;
  const crew = await crewOf({ kingdom: ctx.kingdom, root: store.root }, io);
  reportCrew(ctx, crew);
  const found = { graphs: await graphsOf(ctx.kingdom, store.root, io), forges: await forgesOf(io) };
  const registered = ctx.kingdom.bell.desktop && (await bellRegistered(io));
  const steward = stewardOf(ctx, crew, found, input.values['desktop-bell'] === true, registered);
  const started = await steward.start();
  if (!started.ok) {
    const line =
      started.error === 'locked'
        ? t('cli.run.locked', { kingdom: store.root })
        : t('cli.error.not_a_kingdom', { dir: store.root });
    io.err(line);
    return EXIT.failed;
  }
  io.out(runningLine(t));
  io.out(t('cli.run.started', { kingdom: store.root, seconds: ctx.kingdom.dispatch.tick_seconds }));
  await io.untilStopped();
  io.out(t('cli.run.stopping'));
  await steward.stop();
  io.out(t('cli.run.stopped'));
  return EXIT.ok;
}

export const RUN: CommandSpec = {
  name: ['run'],
  summary: 'cli.run.summary',
  args: [],
  options: { 'desktop-bell': { type: 'boolean', help: 'cli.run.option.desktop_bell' } },
  run: runSteward,
};
