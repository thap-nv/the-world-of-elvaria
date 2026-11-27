# @elvaria/herald

## Does

- Serves HTTP on 127.0.0.1 only (`startHerald`, ADR 0031 item 1): no option names another address; port 0 picks a
  free one. A port in use is an answer with the system's code (`EADDRINUSE`), not a throw. `close()` stops
  listening and drops every open socket.
- Gates every request in a fixed order (ADR 0031 item 4): `Host` must name an allowed origin and `Origin`, when sent,
  must be one exactly (the two loopback origins `http://127.0.0.1:<port>` and `http://localhost:<port>`, plus
  `kingdom.herald.origins`), else 403; then a session cookie for everything but `/pair`, else 401. A loopback origin
  is source `herald`, a tunnel origin source `lite` (`Gate`, used by the commands of P2-01c).
- Pairs a browser (ADR 0031 item 2): `issuePairingCode` writes the SHA-256 of a fresh 128-bit code, its device and
  its expiry (5 minutes) into `.state/herald-pairing.json` under the file's lock, for `elvaria herald pair`.
  `GET /pair?code=…` shows a script-free page with a POST form and changes nothing; `POST /pair` trades the code
  once for a session and redirects to `/`. A wrong, used or expired code counts one failure; the fifth drops every
  pending code and closes pairing until the next `issuePairingCode`.
- Keeps sessions (ADR 0031 item 3, ADR 0037): a 256-bit id in a cookie `HttpOnly; SameSite=Strict; Path=/`, with
  `Secure` over the tunnel's HTTPS; `.state/herald-sessions.json` holds only its hash, the device, `created_at`
  and `last_seen_at` (`readSessions`). Hashes are compared in constant time. A session is valid while its device
  file exists without `revoked_at` (read again at every request, so a revoke counts at the next one) and was used in
  the last 30 days.
- Answers every response with the headers of `SECURITY_HEADERS`: `Content-Security-Policy` with
  `default-src 'self'` and `frame-ancestors 'none'`, `X-Content-Type-Options` `nosniff`, `Referrer-Policy`
  `no-referrer` and `Cache-Control` `no-store`, and never a CORS header. Serves a static folder when given one
  (P2-07's build), only for paths that stay inside it and whose segments are plain names (no hidden file, no `:`, no Windows device name); without one, `/` shows which device
  the browser is.
- Bounds what a stranger can cost (`src/limit/`): body size, open sockets, request time, wrong codes.
- Logs through its own redactor (ADR 0031 item 7): every code and session id it has seen is masked, and entries
  carry no path, query or header.

## Does not

- Hold a string of its own: every word of its pages comes from the composition root (`HeraldPages`); no `i18n`.
- Open the treasury, import the Steward or any work-engine package, or write a quest (ADR 0005, `boundaries.mjs`).
- Write device files: `elvaria herald pair|device|revoke` do (ADR 0037).
- Stream the world or take commands: the WebSocket `/ws`, the filtered `snapshot` and `events`, and the commands
  into `inbox/` come with P2-01c. Passkeys are SEC-08.

## Depends on

- `@elvaria/domain` (`Device`, ids, `Result`, `Clock`), `@elvaria/store` (device files, `withLock`, atomic writes,
  `staysInside`), `@elvaria/eventlog` (`createRedactor`, `redactDeep`).
- `@elvaria/config`, `@elvaria/testkit` (dev only: tsconfig, throwaway folders).

## How to test

```bash
pnpm --filter @elvaria/herald test   # real sockets on port 0 over a temp kingdom with a space in its name; no mana
```
