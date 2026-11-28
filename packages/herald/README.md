# @elvaria/herald

## Does

- Serves HTTP on 127.0.0.1 only (`startHerald`, ADR 0031 item 1): no option names another address; port 0 picks a
  free one. A port in use is an answer with the system's code (`EADDRINUSE`), not a throw. `close()` stops
  listening and drops every open socket.
- Gates every request in a fixed order (ADR 0031 item 4): `Host` must name an allowed origin and `Origin`, when sent,
  must be one exactly (the two loopback origins `http://127.0.0.1:<port>` and `http://localhost:<port>`, plus
  `kingdom.herald.origins`), else 403; then a session cookie for everything but `/pair`, else 401. A loopback origin
  is source `herald`, a tunnel origin source `lite` (`Gate`, the source of a stream's commands).
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
- Streams the world at `/ws` (P2-01c, `src/stream/`): the upgrade passes the same gate, must carry an `Origin` (a page
  always sends one with a WebSocket) and needs a session, else a bare 401, 403 or 404 on the socket. A stream gets a
  `snapshot` (the files through the store's `readKingdomSource`, built by the domain's `worldStateWithManaOf`), the
  owner's `attention` queue (`attentionOf`), then `events` as the log grows: every pulse (`TAIL_INTERVAL_MS`, a loop
  over `EventLog.read`, not `tail`, so it runs while the log is still) reads the log from its cursor, reduces the lines
  into the state and rebuilds the queue from the files read again. A `scoped` or `inquiry` device gets them through
  `scopeState`, `scopeEvents` and `scopeAttention`, plus the result lines of its own commands; a line it does not get
  that changed what it sees is followed by a fresh snapshot. Each pulse reads the streams' device files again: revoked
  or gone closes the stream (4401), a new role or list of territories resends the snapshot. `sandbox: true` streams
  the sandbox's log (`elvaria sandbox replay --to herald`).
- Takes commands on a stream (P2-01c, `src/command/`): `decodeClientMessage`, the device's rate (every stream of it
  together), its device file read again, the envelope the Herald seals (`commandOf`: a ULID, the time, the gate's
  source, the device; a frame naming its own `source`, `id` or `device` is no command), the domain's `deviceMay` with
  the scope its world gives, then `inbox.write`. It answers `accepted` with the command id or `refused` with a code
  (`deviceMay`'s, or `invalid_message`, `too_many_commands`, `failed`); a frame with no ref to answer, or a binary one,
  closes the stream (1008). A phone's command of group 2 or 3 is `passkey_required` until SEC-08.
- Bounds what a stranger can cost (`src/limit/`): body size, open sockets, request time, wrong codes, the frame a client
  sends, streams per device and in all, bytes waiting on one stream, commands a minute.
- Logs through its own redactor (ADR 0031 item 7): every code and session id it has seen is masked, and entries
  carry no path, query or header. Every stream message goes through the same redactor (the event log's patterns and
  those values) before it is encoded (threat model "Trước P2-01" 6).

## Does not

- Hold a string of its own: every word of its pages comes from the composition root (`HeraldPages`); no `i18n`.
- Open the treasury, import the Steward or any work-engine package, or write a quest (ADR 0005, `boundaries.mjs`).
- Write device files: `elvaria herald pair|device|revoke` do (ADR 0037).
- Apply a command, or read its result but from the two `command.*` lines: the Steward applies it and checks the
  device again (ADR 0005). Passkeys are SEC-08.

## Depends on

- `@elvaria/domain` (`Device`, ids, `Result`, `Clock`, the protocol, `deviceMay`, the scope functions, `attentionOf`,
  `reduce`), `@elvaria/store` (device files, inbox, `readKingdomSource`, `withLock`, atomic writes, `staysInside`),
  `@elvaria/eventlog` (the log's reader, `createRedactor`, `redactDeep`).
- `ws` (the WebSocket server; Node 24 has none on the server side): the one dependency outside the workspace that
  ADR 0031 allows.
- `@elvaria/config`, `@elvaria/testkit`, `@types/ws` (dev only: tsconfig, throwaway folders, the event log's fake
  secrets, the types of `ws`, whose client the specs use).

## How to test

```bash
pnpm --filter @elvaria/herald test   # real sockets on port 0 over a temp kingdom with a space in its name; no mana
```
