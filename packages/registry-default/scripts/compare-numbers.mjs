// compare-numbers: every number in an expected JSON file against the same place in an actual one (produces: check).
// Params: { expected_path, actual_path, tolerance = 0 }, both paths inside the plot. A number of `expected` that
// `actual` lacks, or that differs by more than `tolerance`, is a mismatch; extra numbers in `actual` are not.
// Output: { pass, details: { compared, tolerance, mismatches: [{ pointer, expected, actual }] } }.
import { readFileSync } from 'node:fs';

import { cli, insidePlot, isObject, text, UsageError } from './common.mjs';

/** @typedef {{ pointer: string; expected: number; actual: number | null }} Mismatch */

/** JSON Pointer (RFC 6901) escaping of one key. @param {string} key */
const escapeKey = (key) => key.replaceAll('~', '~0').replaceAll('/', '~1');

/**
 * Every number in `value`, keyed by its JSON Pointer.
 * @param {unknown} value @param {string} [pointer] @returns {Map<string, number>}
 */
export function numbersOf(value, pointer = '') {
  if (typeof value === 'number') return new Map([[pointer, value]]);
  /** @type {[string, unknown][]} */
  let children = [];
  if (Array.isArray(value)) children = value.map((item, index) => [String(index), item]);
  else if (isObject(value)) children = Object.entries(value);
  return new Map(children.flatMap(([key, child]) => [...numbersOf(child, `${pointer}/${escapeKey(key)}`)]));
}

/** @param {string} cwd @param {string} relative */
function readJson(cwd, relative) {
  const file = insidePlot(cwd, relative);
  try {
    return /** @type {unknown} */ (JSON.parse(readFileSync(file, 'utf8')));
  } catch (error) {
    const reason = error instanceof SyntaxError ? 'is not valid JSON' : 'cannot be read';
    throw new Error(`${relative} ${reason}`, { cause: error });
  }
}

/** @type {import('./common.mjs').ScriptBody} */
export function run(params, _context, cwd) {
  const tolerance = params['tolerance'] ?? 0;
  if (typeof tolerance !== 'number' || !(tolerance >= 0))
    throw new UsageError('params.tolerance must be a number >= 0');
  const expected = numbersOf(readJson(cwd, text(params, 'expected_path')));
  const actual = numbersOf(readJson(cwd, text(params, 'actual_path')));
  /** @type {Mismatch[]} */
  const mismatches = [];
  for (const [pointer, want] of expected) {
    const got = actual.get(pointer);
    if (got === undefined || Math.abs(got - want) > tolerance)
      mismatches.push({ pointer, expected: want, actual: got ?? null });
  }
  return { pass: mismatches.length === 0, details: { compared: expected.size, tolerance, mismatches } };
}

if (import.meta.main) await cli(run);
