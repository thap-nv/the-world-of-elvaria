// Every request names an allowed host, and an allowed origin when it carries one (ADR 0031 item 4): a page on another
// site cannot post to the Herald (its Origin is not on the list) and a DNS-rebound name cannot reach it (its Host is
// not). The loopback origins are always allowed; `kingdom.herald.origins` adds the tunnel's.
import { err, ok } from '@elvaria/domain';
import type { DeviceSource, Result } from '@elvaria/domain';

/** The one address the Herald listens on (ADR 0031 item 1): no option names another. */
export const LOOPBACK_HOST = '127.0.0.1';

/** The origin a browser on this machine uses to reach the Herald on `port`. */
export const loopbackOrigin = (port: number): string => `http://${LOOPBACK_HOST}:${port}`;

export interface AllowedOrigins {
  /** The loopback origins, `127.0.0.1` and `localhost`: a request through them is the owner at the machine. */
  readonly loopback: readonly string[];
  /** `kingdom.herald.origins`: a request through one of them comes from a paired phone (source `lite`). */
  readonly tunnel: readonly string[];
}

export const allowedOrigins = (port: number, tunnel: readonly string[]): AllowedOrigins => ({
  loopback: [loopbackOrigin(port), `http://localhost:${port}`],
  tunnel,
});

/** How a request that passed the gate came in. */
export interface Gate {
  readonly origin: string;
  /** Source of the commands it may send (ADR 0031 item 5). */
  readonly source: DeviceSource;
  /** Came over the tunnel's HTTPS: the session cookie gets `Secure`. */
  readonly secure: boolean;
}

export type GateRefusal = 'host_refused' | 'origin_refused';

/** `host[:port]` as a Host header carries it: URL drops the scheme's default port, as browsers do. */
const hostOf = (origin: string): string => new URL(origin).host;

const gateOf = (origin: string, allowed: AllowedOrigins): Gate => ({
  origin,
  source: allowed.loopback.includes(origin) ? 'herald' : 'lite',
  secure: origin.startsWith('https://'),
});

/**
 * The gate's answer for a request's `Host` and `Origin` headers. A request without `Origin` (a top-level navigation,
 * a local program) is judged by its host; one with an `Origin` by that origin, which must be on the list itself.
 */
export function gateRequest(
  headers: { readonly host?: string | undefined; readonly origin?: string | undefined },
  allowed: AllowedOrigins,
): Result<Gate, GateRefusal> {
  const every = [...allowed.loopback, ...allowed.tunnel];
  const host = headers.host?.toLowerCase();
  const byHost = every.find((origin) => hostOf(origin) === host);
  if (byHost === undefined) return err('host_refused');
  if (headers.origin === undefined) return ok(gateOf(byHost, allowed));
  // An origin is compared exactly: `null`, another scheme or port, or a list of two is not on it.
  return every.includes(headers.origin) ? ok(gateOf(headers.origin, allowed)) : err('origin_refused');
}
