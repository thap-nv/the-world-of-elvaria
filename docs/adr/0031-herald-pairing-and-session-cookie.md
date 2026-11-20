# ADR 0031 · The Herald authenticates by one-time pairing and a session cookie

- Status: proposed · 2026-11-20
- Related: [threat model](../plans/phase-2-threat-model.md) (R5, R6, N1–N5); [docs/plans/phase-2.md](../plans/phase-2.md) P2-01; [ADR 0005](0005-single-writer-steward-inbox.md), [ADR 0013](0013-treasury-and-redaction.md)

## Context

P2-01 gives Elvaria its first listening socket: the Herald serves static files and a WebSocket on 127.0.0.1, and writes the commands it receives into `inbox/`, where a command carries the owner's authority (ADR 0005). The plan said "a Bearer token in a header", which a browser's WebSocket cannot send. A loopback port is also not private: every local process reaches it, a session's own test code included, and so does any web page the owner opens (cross-site requests, a WebSocket from another origin, DNS rebinding). Through the tunnel the phone reaches the same server.

## Decision

1. **Loopback only.** The Herald binds 127.0.0.1 and has no option to bind anything else. The tunnel is the owner's (a private tailnet), ends TLS, and forwards to loopback.
2. **Pairing.** `elvaria herald pair` prints a one-time code (128 random bits, 5 minutes, one use) as a URL and a QR code. The client posts it to `/pair` and receives a session cookie: 256 random bits, `HttpOnly; SameSite=Strict; Path=/`, and `Secure` when the request came over HTTPS. Five wrong codes close pairing until the owner runs the command again.
3. **Sessions.** The Herald keeps only the SHA-256 of each session id, with a device label, `created_at` and `last_seen_at`, in `<kingdom>/.state/herald-sessions.json`. A session ends after 30 idle days. `elvaria herald devices` lists them; `elvaria herald revoke <device>` and `--all` end them at once.
4. **Every request is checked.** HTTP requests and the WebSocket upgrade need the cookie, compared in constant time. `Host` and, when present, `Origin` must be on `herald.origins` (the loopback origin, plus the tunnel's origin the owner adds); a WebSocket upgrade without an allowed `Origin` is refused. State changes are POST only. The Herald sends no CORS header.
5. **The Herald writes the envelope.** A client sends `kind` and `payload`; the Herald sets `id`, `ts` and `source` (`herald` for a loopback session, `lite` for a paired phone) and adds the device label. Which kinds a source may send is a pure function in `domain`; the Herald refuses the others and the Steward checks again when it applies the command, since `inbox/` is a folder any local program can write.
6. **Secrets.** Pairing codes and session ids are known values of the Herald's redactor and never reach an event, a log or a snapshot. The Herald never opens the treasury.

## Consequences

- No dependency beyond `ws`. No account, no password, no token for the owner to copy.
- A lost phone costs one `revoke`; a stolen cookie is worth the kinds its source may send, and neither the seal nor a delivery is among them in the first wave.
- On loopback the cookie travels over plain HTTP, which only local programs can read; those already reach the kingdom folder, so the session file adds no new trust.
- Anything that can write the kingdom folder can still forge a command or a session. That boundary is the operating system user, as before (threat model R2); this ADR does not close it.
- A stronger check for the seal from the phone (a second factor on the machine) needs its own ADR before the phone may seal.
