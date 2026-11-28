// `elvaria herald [--port <n>]` (P2-01b, ADR 0031): runs the Herald on 127.0.0.1 until Ctrl+C or a stop signal, the
// way `elvaria run` runs the Steward, then closes it and drops every open socket. 0 mana. (P2-01c) It streams the world
// at `/ws` and writes the commands of paired devices to inbox/, for a running Steward to apply. A port in use is the
// system's code and exit 1 on Windows and macOS alike, never a stack trace. No static folder yet: the lite build that
// `/` will serve is P2-07, so `/` shows which device the browser is.
import { startHerald } from '@elvaria/herald';

import { textOption } from '../args.ts';
import { EXIT } from '../command-table/command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { heraldLogLine, heraldPages } from './pages.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command-table/command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

const PORT_MAX = 65_535;

/** `--port`, else kingdom.herald.port; undefined for a value that is no port (0 is: it picks a free one). */
function portOf(input: CommandInput, ctx: KingdomContext): number | undefined {
  const text = textOption(input, 'port');
  if (text === undefined) return ctx.kingdom.herald.port;
  const port = /^\d{1,5}$/.test(text) ? Number(text) : Number.NaN;
  return port <= PORT_MAX ? port : undefined;
}

async function runHerald(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const { io, t, kingdom } = ctx;
  const port = portOf(input, ctx);
  if (port === undefined) {
    io.err(t('cli.herald.bad_port', { value: textOption(input, 'port') ?? '' }));
    return EXIT.usage;
  }
  const started = await startHerald({
    store: ctx.store,
    kingdom,
    ids: ctx.ids,
    port,
    origins: kingdom.herald.origins,
    clock: io.clock,
    format: ctx.format,
    random: io.random,
    pages: heraldPages(ctx),
    log: heraldLogLine(ctx),
  });
  if (!started.ok) {
    const { code } = started.error;
    io.err(t(code === 'EADDRINUSE' ? 'cli.herald.port_in_use' : 'cli.herald.start_failed', { port, code }));
    return EXIT.failed;
  }
  io.out(t('cli.herald.listening', { origin: started.value.origin }));
  kingdom.herald.origins.forEach((origin) => {
    io.out(t('cli.herald.origin', { origin }));
  });
  io.out(t('cli.herald.pair_hint'));
  await io.untilStopped();
  io.out(t('cli.herald.stopping'));
  await started.value.close();
  io.out(t('cli.herald.stopped'));
  return EXIT.ok;
}

export const HERALD: CommandSpec = {
  name: ['herald'],
  summary: 'cli.herald.summary',
  args: [],
  options: { port: { type: 'string', value: '<port>', help: 'cli.herald.option.port' } },
  run: runHerald,
};
