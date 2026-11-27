// startHerald: one `node:http` server on 127.0.0.1 (ADR 0031 item 1; no option for another address), the ceilings of
// limit/ on its sockets, and handle() for every request. A port already taken is an answer with the system's code
// (EADDRINUSE), not a throw, so `elvaria herald` says so and exits non-zero on Windows and macOS alike.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { err, ok } from '@elvaria/domain';
import type { Clock, Instant, RandomSource, Result } from '@elvaria/domain';
import type { KingdomStore } from '@elvaria/store';

import { CONNECTIONS_MAX, REQUEST_TIMEOUT_MS } from '../limit/limits.ts';
import { LOOPBACK_HOST, allowedOrigins, loopbackOrigin } from '../origin/origin.ts';
import { handle } from './handle.ts';
import { heraldLog } from './log.ts';
import { sendRefusal } from './respond.ts';
import type { HeraldLogEntry } from './log.ts';
import type { HeraldPages } from './pages.ts';

export interface HeraldOptions {
  readonly store: KingdomStore;
  /** `kingdom.herald.port`, or `--port` for one run; 0 picks a free port (tests). */
  readonly port: number;
  /** `kingdom.herald.origins`: the tunnel's, besides loopback. */
  readonly origins: readonly string[];
  readonly clock: Clock;
  readonly format: (at: Instant) => string;
  readonly random: RandomSource;
  readonly pages: HeraldPages;
  /** Already redacted (log.ts). */
  readonly log: (entry: HeraldLogEntry) => void;
  readonly staticDir?: string;
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

export async function startHerald(options: HeraldOptions): Promise<Result<RunningHerald, HeraldStartError>> {
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
  if (!listened.ok) return listened;
  const port = listened.value;
  const log = heraldLog(options.log);
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
  return ok({
    port,
    origin: loopbackOrigin(port),
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
        server.closeAllConnections();
      }),
  });
}
