// The structured output of an agy run (P1-56, (i) of the P1-50 report). agy takes it from the model's `finish` call
// under `--json-schema` (spike §1 #5), and a model that prints a stand-in first and its real answer after still has
// the stand-in there: in Q5 of P1-50 a judge printed `{"notes":"placeholder","result":"pass"}` in the middle of its
// answer, agy kept that as `structured_output`, and the Steward wrote a `partial` verdict from it. So the answer's
// own last JSON object comes first, and a stand-in is no answer at all.
import type { AgyResult } from './stream.ts';

/** Every `{…}` that stands by itself in `text`, outermost only, strings and escapes read as JSON reads them. */
function objectSpans(text: string): string[] {
  const spans: string[] = [];
  let depth = 0;
  let begin = 0;
  let inString = false;
  let escaped = false;
  for (let at = 0; at < text.length; at += 1) {
    const char = text.charAt(at);
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"' && depth > 0) {
      inString = true;
    } else if (char === '{') {
      if (depth === 0) begin = at;
      depth += 1;
    } else if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0) spans.push(text.slice(begin, at + 1));
    }
  }
  return spans;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The last JSON object in the text of an answer; undefined when it holds none (prose with braces is not one). */
export function lastJsonObject(text: string): Record<string, unknown> | undefined {
  for (const span of objectSpans(text).reverse()) {
    try {
      const value: unknown = JSON.parse(span);
      if (isObject(value)) return value;
    } catch {
      // Braces in prose or in code: not JSON.
    }
  }
  return undefined;
}

/**
 * Notes that only hold a place: one word the model writes to satisfy a schema that requires notes (`minLength: 1`)
 * before it has anything to say. A verdict with them says nothing a judge read.
 */
const PLACEHOLDER_NOTES = new Set(['placeholder', 'todo', 'tbd', 'n/a']);

/** A structured output whose `notes` is such a word. */
export function isPlaceholder(value: unknown): boolean {
  if (!isObject(value) || typeof value.notes !== 'string') return false;
  return PLACEHOLDER_NOTES.has(value.notes.trim().replace(/\.$/, '').toLowerCase());
}

/**
 * What the run answered: the last JSON object of the answer's text, else agy's own `structured_output`; undefined when
 * there is none or the one there is a stand-in. The Steward then sees a run without an answer, which it already
 * handles (a judge that leaves without a verdict makes room for the next), and not a verdict nobody read.
 */
export function structuredOf(result: AgyResult | undefined): unknown {
  if (result === undefined) return undefined;
  const candidates = [lastJsonObject(result.response), result.structured_output];
  return candidates.find((value) => value !== undefined && !isPlaceholder(value));
}
