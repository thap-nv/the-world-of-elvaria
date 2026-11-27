// Every way the Herald says no, and the status it answers with. The page that goes with each is the composition
// root's text (pages.ts): the Herald has no strings of its own (wave-1 plan, row 44).

export const REFUSAL_STATUS = {
  // The gate (origin.ts): a host or origin not on the list.
  host_refused: 403,
  origin_refused: 403,
  // A session (session.ts): none, or its device file gone or revoked.
  no_session: 401,
  unknown_device: 401,
  device_revoked: 401,
  // Pairing (pairing.ts): a wrong, used or expired code, or five of them.
  code_refused: 403,
  pairing_closed: 403,
  // The request itself.
  bad_request: 400,
  not_found: 404,
  body_too_large: 413,
  failed: 500,
} as const;

export type HeraldRefusal = keyof typeof REFUSAL_STATUS;
