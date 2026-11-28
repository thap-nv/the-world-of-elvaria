// The Herald's ceilings, named (wave-1 plan P2-01b; threat model "Trước P2-01" 4). Each bounds what one request or one
// stranger can cost: a guess at a pairing code, a body, an open socket, a frame, a burst of commands (P2-01c).

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
/** The largest WebSocket frame a client may send, a command with its quest's text; a larger one closes the stream. */
export const FRAME_BYTES_MAX = 64 * 1024;
/** Streams one device holds open at once: a few tabs or windows of the same pairing. */
export const STREAMS_PER_DEVICE_MAX = 4;
/** Streams open at once, every device together; below CONNECTIONS_MAX, so plain requests still get through. */
export const STREAMS_MAX = 16;
/** What may wait unsent on one stream; a client that reads slower than the kingdom moves is dropped. */
export const STREAM_BUFFER_BYTES_MAX = 8 * 1024 * 1024;
/** Commands one device sends in COMMAND_WINDOW_MS, every stream of it together; the next is refused. */
export const COMMANDS_PER_WINDOW_MAX = 30;
export const COMMAND_WINDOW_MS = 60 * 1000;
/** How long a closing stream waits for the client's close frame before its socket is dropped. */
export const STREAM_CLOSE_GRACE_MS = 1000;
/**
 * (SEC-08, ADR 0038) A passkey challenge: 256 random bits for a registration (a command's is its hash). It waits for
 * the browser's answer as long as WebAuthn's own default timeout, then is dropped.
 */
export const PASSKEY_CHALLENGE_BYTES = 32;
export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60 * 1000;
/** Challenges one device may hold unanswered; the oldest is dropped past it. */
export const PASSKEY_CHALLENGES_PER_DEVICE_MAX = 8;
/**
 * A device's first passkey needs no signature, only a session a pairing code opened this recently (ADR 0038 item 5):
 * as long as the code itself was good, so the owner pairs and registers in one sitting.
 */
export const FIRST_PASSKEY_WINDOW_MS = 5 * 60 * 1000;
