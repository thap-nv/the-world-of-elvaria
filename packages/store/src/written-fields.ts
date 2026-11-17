// What a rewrite of a kingdom file puts back: the fields the file had and the fields the change set, not the
// defaults the schema filled in when the file was read (owner's settlement (187)). Without this a patrol that
// changed one field wrote every default of the territory schema into territory.json. Pure; the store does the IO.
import { isDeepStrictEqual } from 'node:util';

import type { Parser } from './stored-file.ts';

/** A file as `update` read it: `raw` is the JSON after migration, `value` the same after the schema. */
export interface ReadBack<T> {
  readonly raw: unknown;
  readonly value: T;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * `next` without the keys that `raw` lacks and that still hold what the schema filled into `read`, at any depth.
 * An object the file lacked and the change touched keeps only the keys it changed. Array items pair by index;
 * an item past the end of the file's array is new and is kept whole.
 */
export function dropFilledDefaults(next: unknown, raw: unknown, read: unknown): unknown {
  if (Array.isArray(next) && Array.isArray(raw) && Array.isArray(read))
    return next.map((item: unknown, index) =>
      index < raw.length ? dropFilledDefaults(item, raw[index], read[index]) : item,
    );
  if (!isRecord(next) || !isRecord(raw) || !isRecord(read)) return next;
  const kept: [string, unknown][] = [];
  for (const [key, value] of Object.entries(next)) {
    if (Object.hasOwn(raw, key)) kept.push([key, dropFilledDefaults(value, raw[key], read[key])]);
    else if (!isDeepStrictEqual(value, read[key])) kept.push([key, dropFilledDefaults(value, {}, read[key])]);
  }
  return Object.fromEntries(kept);
}

/**
 * What to write once `before` was changed into `value` (validated): the sparse form when the schema reads it
 * back as `value`, else `value` whole. The check covers what pairing by key and index cannot see, such as a
 * default that depends on another field, or an array item that moved; the file is then as full as before (187).
 */
export function toWrite<T>(value: T, before: ReadBack<T>, parser: Parser<T>): unknown {
  const sparse = dropFilledDefaults(value, before.raw, before.value);
  const back = parser.safeParse(sparse);
  return back.success && isDeepStrictEqual(back.data, value) ? sparse : value;
}
