// The Herald's ceilings, named (wave-1 plan P2-01b; threat model "Trước P2-01" 4). Each bounds what one request or one
// stranger can cost: a guess at a pairing code, a body, an open socket. The WebSocket frame and the commands a minute
// come with the stream (P2-01c).

/** A pairing code: 128 random bits (ADR 0031 item 2). */
export const PAIRING_CODE_BYTES = 16;
/** A pairing code is good for five minutes after `elvaria herald pair` prints it (ADR 0031 item 2). */
export const PAIRING_CODE_TTL_MS = 5 * 60 * 1000;
/** Wrong codes before every pending code is dropped and pairing stays closed until the next `herald pair`. */
export const PAIRING_FAILURES_MAX = 5;
/** A session id: 256 random bits (ADR 0031 item 2). */
export const SESSION_ID_BYTES = 32;
/** A session unused this long has ended (ADR 0031 item 3). */
export const SESSION_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
/**
 * How stale `last_seen_at` may get before a request writes it again: one write an hour per session at most, which
 * moves the end of a 30-day idle window by at most an hour.
 */
export const SESSION_TOUCH_MS = 60 * 60 * 1000;
/** The largest request body read: the pairing form holds one code. */
export const BODY_BYTES_MAX = 4 * 1024;
/** Sockets open at once; one more is closed by Node as it connects. */
export const CONNECTIONS_MAX = 32;
/** Time for a client to send its headers, and its whole request, before Node closes the socket. */
export const REQUEST_TIMEOUT_MS = 10_000;
