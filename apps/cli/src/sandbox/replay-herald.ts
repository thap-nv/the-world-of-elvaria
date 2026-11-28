// `elvaria sandbox replay <file> --to herald [--port <n>]` (P2-01c): a fake day played through a Herald over a
// throwaway kingdom, so the world and the phone can be watched on a day that cost nothing. The kingdom is made with
// `init`'s defaults in the OS temp folder; one `full` device is paired with a printed link; once the browser opens its
// stream, the day's lines are appended to that kingdom's sandbox log on the replay's schedule (replaySchedule of
// @elvaria/sandbox, the terminal's too), and the Herald streams them with `sandbox: true`. It runs until Ctrl+C or a
// stop signal, then the folder is removed. Waits are cut in steps of a second, so a stop ends the day at once. 0 mana.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { zonedTime } from '@elvaria/domain';
import type { Event } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { issuePairingCode, loopbackOrigin, startHerald } from '@elvaria/herald';
import type { HeraldLogEntry, RunningHerald } from '@elvaria/herald';
import { REGISTRY_ROOT, registryFiles } from '@elvaria/registry-default';
import { replaySchedule } from '@elvaria/sandbox';
import { RM_RETRY, initKingdom, toPortable } from '@elvaria/store';

import { EXIT } from '../command-table/command.ts';
import { heraldLogLine, heraldPages } from '../herald/pages.ts';
import { newKingdom } from '../init/init.ts';
import { storeIssueLines } from '../issues.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import type { CliContext, ExitCode } from '../command-table/command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

const STEP_MS = 1000;
const FOLDER_PREFIX = 'elvaria sandbox herald ';

export interface HeraldReplay {
  readonly events: readonly Event[];
  readonly speed: number;
  readonly port: number;
}

/** A kingdom as `elvaria init` makes it, in `dir`, opened as a command's context. */
async function throwawayKingdom(cli: CliContext, dir: string): Promise<KingdomContext | undefined> {
  const { io, t } = cli;
  const zone = zonedTime(io.timeZone);
  const tz = zone.ok ? io.timeZone : 'UTC';
  const kingdom = newKingdom({
    name: t('cli.sandbox.herald.kingdom'),
    profession: 'developer',
    locale: cli.locale,
    tz,
    treasury: toPortable(path.join(dir, 'treasury.json'), io.platform),
    createdAt: zone.ok ? zone.value.format(io.clock.now()) : new Date(io.clock.now()).toISOString(),
  });
  const created = await initKingdom(dir, kingdom, { root: REGISTRY_ROOT, files: registryFiles() });
  if (!created.ok) {
    storeIssueLines(t, created.error).forEach(io.err);
    return undefined;
  }
  return openKingdomContext({ values: { kingdom: dir }, positionals: [] }, cli);
}

/** A full device of the throwaway kingdom and its one-time code; undefined when the pairing file was locked. */
async function pairingCode(ctx: KingdomContext): Promise<string | undefined> {
  const { store, io, t } = ctx;
  const id = ctx.ids.device();
  await store.devices.write({
    version: 1,
    id,
    label: t('cli.sandbox.herald.device'),
    role: 'full',
    created_at: ctx.now(),
  });
  const issued = await issuePairingCode(
    { root: store.root, clock: io.clock, format: ctx.format, random: io.random },
    id,
  );
  return issued.ok ? issued.value.code : undefined;
}

/** Appends the day's lines on their schedule; stops between two lines once `stopped()`. */
async function playDay(ctx: KingdomContext, replay: HeraldReplay, stopped: () => boolean): Promise<void> {
  const log = openEventLog(ctx.store.root, { sandbox: true });
  for (const { event, waitMs } of replaySchedule(replay.events, replay.speed)) {
    for (let left = waitMs; left > 0 && !stopped(); left -= STEP_MS)
      await ctx.io.sleep(Math.min(left, STEP_MS));
    if (stopped()) return;
    await log.append([event]);
  }
}

/** Starts the Herald on the throwaway kingdom; `opened` resolves when a browser opens its first stream. */
async function heraldOf(ctx: KingdomContext, port: number) {
  let streamOpened = (): void => undefined;
  const opened = new Promise<void>((resolve) => {
    streamOpened = resolve;
  });
  const line = heraldLogLine(ctx);
  const log = (entry: HeraldLogEntry): void => {
    line(entry);
    if (entry.kind === 'stream' && entry.open) streamOpened();
  };
  const { store, kingdom, io } = ctx;
  const started = await startHerald({
    ...{ store, kingdom, port, origins: [], ids: ctx.ids, sandbox: true, log },
    ...{ clock: io.clock, format: ctx.format, random: io.random, pages: heraldPages(ctx) },
  });
  return { started, opened };
}

async function streamDay(
  ctx: KingdomContext,
  replay: HeraldReplay,
  herald: RunningHerald,
  opened: Promise<void>,
) {
  const { io, t } = ctx;
  const code = await pairingCode(ctx);
  io.out(t('cli.herald.listening', { origin: herald.origin }));
  io.out(t('cli.sandbox.herald.pair'));
  io.out(`${loopbackOrigin(herald.port)}/pair?code=${code ?? ''}`);
  // An object, not a `let`: the stop is set from the signal's callback, between awaits.
  const owner = { stopped: false };
  const stopped = io.untilStopped().then(() => {
    owner.stopped = true;
  });
  await Promise.race([opened, stopped]);
  await playDay(ctx, replay, () => owner.stopped);
  if (!owner.stopped) io.out(t('cli.sandbox.herald.played', { lines: replay.events.length }));
  await stopped;
}

/** Plays `replay` through a Herald; the exit code of the run, issues of the file aside. */
export async function replayToHerald(cli: CliContext, replay: HeraldReplay): Promise<ExitCode> {
  const dir = await mkdtemp(path.join(tmpdir(), FOLDER_PREFIX));
  try {
    const ctx = await throwawayKingdom(cli, dir);
    if (ctx === undefined) return EXIT.failed;
    const { started, opened } = await heraldOf(ctx, replay.port);
    if (!started.ok) {
      const { code } = started.error;
      cli.io.err(
        cli.t(code === 'EADDRINUSE' ? 'cli.herald.port_in_use' : 'cli.herald.start_failed', {
          port: replay.port,
          code,
        }),
      );
      return EXIT.failed;
    }
    await streamDay(ctx, replay, started.value, opened);
    await started.value.close();
    cli.io.out(cli.t('cli.herald.stopped'));
    return EXIT.ok;
  } finally {
    await rm(dir, RM_RETRY);
  }
}
