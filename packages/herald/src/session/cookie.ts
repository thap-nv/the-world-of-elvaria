// The session cookie (ADR 0031 item 2): HttpOnly so no script reads it, SameSite=Strict so no other site's page
// sends it, Secure when the request came over the tunnel's HTTPS. Its id is 256 random bits; the Herald keeps only
// the hash (sessions.ts).

export const SESSION_COOKIE = 'elvaria_session';

/**
 * The browser keeps the cookie this long (400 days, the most Chrome allows); the Herald ends the session after 30
 * idle days itself, so an active phone is not logged out on a date fixed at pairing.
 */
const COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;

/** The value of cookie `name` in a `Cookie` header, or undefined. */
export function cookieValue(header: string | undefined, name: string = SESSION_COOKIE): string | undefined {
  if (header === undefined) return undefined;
  for (const pair of header.split(';')) {
    const at = pair.indexOf('=');
    if (at > 0 && pair.slice(0, at).trim() === name) return pair.slice(at + 1).trim();
  }
  return undefined;
}

/** The `Set-Cookie` value that hands `id` to the browser. */
export function sessionCookie(id: string, secure: boolean): string {
  const attributes = ['HttpOnly', 'SameSite=Strict', 'Path=/', `Max-Age=${COOKIE_MAX_AGE_S}`];
  return [`${SESSION_COOKIE}=${id}`, ...attributes, ...(secure ? ['Secure'] : [])].join('; ');
}
