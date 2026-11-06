// Long strings (a heredoc command, a notice, a reason) are cut so that a line stays under MAX_LINE_BYTES, the
// size one write() keeps whole next to other writers (§9.2). This runs after redaction: cutting first could
// leave half a secret that no pattern matches any more (implementation-plan §3.6 "Hook trên eventlog").
import { MAX_LINE_BYTES } from '@elvaria/eventlog';

export const TRUNCATED = '…[truncated]';

/**
 * Characters kept per string, tried in order until the line fits. 8192 always applies: it keeps any ordinary
 * command whole, and a journal line longer than that would crowd the 20 lines a revival prompt quotes (§3.5).
 */
const STRING_LIMITS = [8192, 2048, 512, 128] as const;

/** `text` cut to `limit` UTF-16 units plus the marker, never inside a surrogate pair. */
export function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const high = text.charCodeAt(limit - 1);
  const cut = high >= 0xd8_00 && high <= 0xdb_ff ? limit - 1 : limit;
  return `${text.slice(0, cut)}${TRUNCATED}`;
}

function walk(value: unknown, limit: number): unknown {
  if (typeof value === 'string') return truncate(value, limit);
  if (Array.isArray(value)) return value.map((item: unknown) => walk(item, limit));
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walk(item, limit)]));
}

const fits = (value: unknown): boolean =>
  Buffer.byteLength(JSON.stringify(value), 'utf8') + 1 <= MAX_LINE_BYTES;

/**
 * `event` with every string cut to the largest limit that makes the line fit. If even the smallest does not
 * (thousands of fields), it is returned at that limit and appendEvents refuses it with `line_too_long`.
 */
export function fitLine<T>(event: T): T {
  let candidate: unknown = event;
  for (const limit of STRING_LIMITS) {
    candidate = walk(event, limit);
    if (fits(candidate)) break;
  }
  // walk() returns the shape it was given, with strings replaced by strings.
  return candidate as T;
}
