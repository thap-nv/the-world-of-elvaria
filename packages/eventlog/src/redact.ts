// Secrets never reach a prompt, a journal or a log (ADR 0013). The hook redacts an event before appending it,
// the runner its CLI output, the store handover letters and verdict notes, the herald what it sends. Known
// values (the treasury's) are masked exactly; patterns catch the shapes of common keys and are data, in
// redact-patterns.json, so adding one is a data change with a fixture (redact.spec.ts).
import { EventLogError } from './errors.ts';
import patternFile from './redact-patterns.json' with { type: 'json' };

export const REDACTED = '[redacted]';

export interface RedactPatternEntry {
  /** snake_case, names the kind of secret in redact.spec.ts. */
  readonly id: string;
  readonly description: string;
  /** JavaScript regex source. A named group `keep` is left in front of the mask (`password=[redacted]`). */
  readonly regex: string;
  readonly flags: string;
}

/** `g` is added by the compiler; `y` and `d` would change what replace() does. */
const ALLOWED_FLAGS = /^[imsu]*$/;

export function compileRedactPatterns(entries: readonly RedactPatternEntry[]): RegExp[] {
  return entries.map((entry) => {
    if (!ALLOWED_FLAGS.test(entry.flags)) {
      throw new EventLogError(
        'invalid_pattern',
        `redact pattern ${entry.id}: flags "${entry.flags}"; allowed are i, m, s, u`,
      );
    }
    return new RegExp(entry.regex, `${entry.flags}g`);
  });
}

/** The patterns of redact-patterns.json, in file order: specific shapes first, generic assignments last. */
export const REDACT_PATTERNS: readonly RegExp[] = Object.freeze(compileRedactPatterns(patternFile.patterns));

export type Redactor = (text: string) => string;

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** One regex for all known values, longest first, so a value that contains another is masked whole. */
function knownValuesPattern(known: readonly string[]): RegExp | undefined {
  const values = [...new Set(known)].filter((value) => value !== '').sort((a, b) => b.length - a.length);
  return values.length === 0 ? undefined : new RegExp(values.map(escapeRegex).join('|'), 'g');
}

/** replace() callback: the match becomes REDACTED, after the named group `keep` when the pattern has one. */
function mask(_match: string, ...rest: unknown[]): string {
  const groups = rest.at(-1);
  const keep = typeof groups === 'object' && groups !== null && 'keep' in groups ? groups.keep : undefined;
  return typeof keep === 'string' ? `${keep}${REDACTED}` : REDACTED;
}

const asGlobal = (pattern: RegExp): RegExp =>
  pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);

/**
 * Compiles once what `redact` would compile per call: use it for many strings (redactDeep, a stream).
 * Known values go first: a pattern that masked part of a known value would leave the rest of it readable.
 */
export function createRedactor(
  known: readonly string[],
  patterns: readonly RegExp[] = REDACT_PATTERNS,
): Redactor {
  const exact = knownValuesPattern(known);
  const shapes = patterns.map(asGlobal);
  return (text) => {
    let out = exact === undefined ? text : text.replace(exact, REDACTED);
    for (const pattern of shapes) out = out.replace(pattern, mask);
    return out;
  };
}

/** `text` with every known value and every pattern match masked (implementation-plan §3.9). */
export function redact(
  text: string,
  known: readonly string[],
  patterns: readonly RegExp[] = REDACT_PATTERNS,
): string {
  return createRedactor(known, patterns)(text);
}

function walk(value: unknown, redactor: Redactor): unknown {
  if (typeof value === 'string') return redactor(value);
  if (Array.isArray(value)) return value.map((item: unknown) => walk(item, redactor));
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, walk(item, redactor)]));
}

/**
 * A copy of a JSON value (an event before it is appended) with every string redacted. Strings are redacted one
 * by one, never the serialised line: a pattern that runs past a closing quote would break the JSON.
 */
export function redactDeep<T>(value: T, redactor: Redactor): T {
  // walk() returns the shape it was given, with strings replaced by strings.
  return walk(value, redactor) as T;
}
