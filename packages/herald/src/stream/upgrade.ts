// The upgrade to a stream at `/ws` (wave-1 plan P2-01c; ADR 0031 item 4, threat model "Trước P2-01" 1): the same gate
// as every request, except that an upgrade without `Origin` is refused (every browser sends one with a WebSocket, so
// none is a program that is not a page, and a page of another site cannot hide its own), then the session cookie,
// whose device file is read again. A refusal is a bare HTTP status on the socket, then the socket is closed.
import { STATUS_CODES } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

import { err, ok } from '@elvaria/domain';
import type { Device, Result } from '@elvaria/domain';

import { gateRequest } from '../origin/origin.ts';
import { REFUSAL_STATUS } from '../server/refusal.ts';
import { cookieValue } from '../session/cookie.ts';
import { sessionDevice } from '../session/session.ts';
import type { AllowedOrigins, Gate } from '../origin/origin.ts';
import type { HeraldRefusal } from '../server/refusal.ts';
import type { SessionDeps } from '../session/session.ts';

/** The one path a stream opens on. */
export const STREAM_PATH = '/ws';

export interface UpgradeContext extends SessionDeps {
  readonly allowed: AllowedOrigins;
}

/** The device of the upgrade's session and how it came in, or why it may not open a stream. */
export async function upgradeGate(
  req: IncomingMessage,
  ctx: UpgradeContext,
): Promise<Result<{ readonly device: Device; readonly gate: Gate }, HeraldRefusal>> {
  // Only the path is read; the base never shows.
  const url = new URL(req.url ?? '/', 'http://herald.invalid');
  if (url.pathname !== STREAM_PATH || req.method !== 'GET') return err('not_found');
  const { host, origin } = req.headers;
  if (origin === undefined) return err('origin_refused');
  const gate = gateRequest({ host, origin }, ctx.allowed);
  if (!gate.ok) return err(gate.error);
  const device = await sessionDevice(ctx, cookieValue(req.headers.cookie));
  if (!device.ok) return err(device.error);
  return ok({ device: device.value, gate: gate.value });
}

/** Answers a refused upgrade with its status and no body, and closes the socket. */
export function refuseUpgrade(socket: Duplex, refusal: HeraldRefusal): void {
  const status = REFUSAL_STATUS[refusal];
  const head = [`HTTP/1.1 ${status} ${STATUS_CODES[status] ?? ''}`, 'Connection: close', 'Content-Length: 0'];
  socket.end(`${head.join('\r\n')}\r\n\r\n`);
}
