// startHerald: one `node:http` server on 127.0.0.1 (ADR 0031 item 1; no option for another address), the ceilings of
// limit/ on its sockets, handle() for every request, and the streams of `/ws` (P2-01c) for every upgrade. A port already taken is an answer with the system's code
// (EADDRINUSE), not a throw, so `elvaria herald` says so and exits non-zero on Windows and macOS alike.
import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { AddressInfo } from 'node:net';

import { err, ok } from '@elvaria/domain';
import type { Clock, IdSource, Instant, Kingdom, RandomSource, Result } from '@elvaria/domain';
import { TAIL_INTERVAL_MS } from '@elvaria/eventlog';
import type { KingdomStore } from '@elvaria/store';

import { CONNECTIONS_MAX, REQUEST_TIMEOUT_MS } from '../limit/limits.ts';
import { LOOPBACK_HOST, allowedOrigins, loopbackOrigin } from '../origin/origin.ts';
import { openStream } from '../stream/stream.ts';
import { refuseUpgrade, upgradeGate } from '../stream/upgrade.ts';
import type { Stream } from '../stream/stream.ts';
import type { UpgradeContext } from '../stream/upgrade.ts';
import { handle } from './handle.ts';
import { heraldLog } from './log.ts';
import { sendRefusal } from './respond.ts';
import type { HeraldLog, HeraldLogEntry } from './log.ts';
import type { HeraldPages } from './pages.ts';

export interface HeraldOptions {
  readonly store: KingdomStore;
  /** kingdom.json as the composition root read it: the world state's name, zone and tribes. */
  readonly kingdom: Kingdom;
  /** `kingdom.herald.port`, or `--port` for one run; 0 picks a free port (tests). */
  readonly port: number;
  /** `kingdom.herald.origins`: the tunnel's, besides loopback. */
  readonly origins: readonly string[];
  readonly clock: Clock;
  readonly format: (at: Instant) => string;
  readonly random: RandomSource;
  /** The ids of the commands the Herald writes to inbox/, and of the device a pair_device makes (SEC-08). */
  readonly ids: Pick<IdSource, 'ulid' | 'device'>;
  readonly pages: HeraldPages;
  /** Already redacted (log.ts). */
  readonly log: (entry: HeraldLogEntry) => void;
  readonly staticDir?: string;
  /** Streams the sandbox's log of a fake day (`elvaria sandbox replay --to herald`); the state says `sandbox`. */
  readonly sandbox?: boolean;
  /** How often the log and the streams' device files are read again; TAIL_INTERVAL_MS by default. */
  readonly intervalMs?: number;
}

export interface RunningHerald {
  readonly port: number;
  /** `http://127.0.0.1:<port>`. */
  readonly origin: string;
  /** Stops listening and drops every open socket. */
  close(): Promise<void>;
}

export interface HeraldStartError {
  /** The system's code: `EADDRINUSE` for a port in use, `EACCES` for one the user may not open. */
  readonly code: string;
  readonly port: number;
}

const codeOf = (error: unknown): string =>
  typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : 'UNKNOWN';

/** Every upgrade: the gate and the session (upgrade.ts), then a stream, or a refusal on the socket. */
const upgradeListener =
  (stream: Stream, ctx: UpgradeContext & { readonly log: HeraldLog }) =>
  (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
    // A client that drops the socket while the session is read must not throw out of the server.
    socket.on('error', () => socket.destroy());
    upgradeGate(req, ctx)
      .then((passed) => {
        const refusal = passed.ok
          ? stream.accept(
              { req, socket, head },
              {
                device: passed.value.session.device,
                source: passed.value.gate.source,
                origin: passed.value.gate.origin,
                opened_at: passed.value.session.opened_at,
              },
            )
          : passed;
        if (refusal.ok) return;
        ctx.log.write({ kind: 'refused', refusal: refusal.error, method: req.method ?? '' });
        refuseUpgrade(socket, refusal.error);
      })
      .catch((error: unknown) => {
        ctx.log.write({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });
        refuseUpgrade(socket, 'failed');
      });
  };

export async function startHerald(options: HeraldOptions): Promise<Result<RunningHerald, HeraldStartError>> {
  const log = heraldLog(options.log);
  const stream = await openStream({
    ...options,
    log,
    sandbox: options.sandbox ?? false,
    intervalMs: options.intervalMs ?? TAIL_INTERVAL_MS,
  });
  const server = createServer({ requestTimeout: REQUEST_TIMEOUT_MS, headersTimeout: REQUEST_TIMEOUT_MS });
  server.maxConnections = CONNECTIONS_MAX;
  const listened = await new Promise<Result<number, HeraldStartError>>((resolve) => {
    server.once('error', (error) => {
      resolve(err({ code: codeOf(error), port: options.port }));
    });
    server.listen({ host: LOOPBACK_HOST, port: options.port, exclusive: true }, () => {
      resolve(ok((server.address() as AddressInfo).port));
    });
  });
  if (!listened.ok) {
    await stream.close();
    return listened;
  }
  const port = listened.value;
  const ctx = {
    ...options,
    allowed: allowedOrigins(port, options.origins),
    log,
    staticDir: options.staticDir,
  };
  server.on('request', (req, res) => {
    handle(req, res, ctx).catch((error: unknown) => {
      log.write({ kind: 'failed', message: error instanceof Error ? error.message : String(error) });
      if (res.headersSent) res.destroy();
      else sendRefusal(res, options.pages, 'failed');
    });
  });
  server.on('upgrade', upgradeListener(stream, ctx));
  return ok({
    port,
    origin: loopbackOrigin(port),
    close: async () => {
      await stream.close();
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
        server.closeAllConnections();
      });
    },
  });
}
