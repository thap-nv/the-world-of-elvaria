// The schema of `--output-schema` as OpenAI's API takes it, and the answer back as the core asked for it (ADR 0021:
// this is the API's law, not the core's). Codex sends the schema as strict structured output (`codex_output_schema`),
// which takes a subset of JSON Schema (OpenAI's Structured Outputs guide, "Supported schemas"): every key of
// `properties` in `required`, a key that may be left out as a union with null; `additionalProperties: false` on every
// object; no `allOf`, `not`, `if`/`then`/`else`, `dependentRequired`, `dependentSchemas`; and, not in the guide but
// measured, no `uniqueItems`. Anything else the API refuses before any model call: a 400 at 0 tokens (Codex
// 0.169.0-alpha.11.1, gpt-6.1-sol, 2026-11-14: the judge's verdict had three optional keys, and both judging sessions
// of a quest were lost; `uniqueItems` in the memo-triage contract, gpt-6-luna, the live run of this branch). What the
// strict schema no longer says, the core's zod checks when the answer comes back, as for the combinators Claude Code
// refuses at the top (forTheCli).
import type { JsonSchema } from '@elvaria/runner-core';

type Node = Readonly<Record<string, unknown>>;

/**
 * Keywords the API refuses at any depth: those the guide names for every model, and `uniqueItems`, which it does not
 * name ("'schema.properties.decisions.items.properties.ask.uniqueItems' is not permitted when strict is true").
 */
const NOT_STRICT: ReadonlySet<string> = new Set([
  'allOf',
  'not',
  'if',
  'then',
  'else',
  'dependentRequired',
  'dependentSchemas',
  'uniqueItems',
]);
/** Types whose null is said in `type` itself; anything else becomes a union with null. */
const SCALARS: ReadonlySet<unknown> = new Set(['string', 'number', 'integer', 'boolean']);

const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const mapValues = (node: Node, change: (value: unknown) => unknown): Node =>
  Object.fromEntries(Object.entries(node).map(([key, value]) => [key, change(value)]));

/**
 * A key the core may leave out, present and null when left out: `type: [t, "null"]` for a scalar type, the guide's
 * own example; else a union, since an enum, a const, an object or a `$ref` would still refuse a bare null.
 */
function nullable(node: unknown): Node {
  if (!isNode(node)) return { anyOf: [node, { type: 'null' }] };
  const scalar = SCALARS.has(node.type) && node.enum === undefined && node.const === undefined;
  return scalar ? { ...node, type: [node.type, 'null'] } : { anyOf: [node, { type: 'null' }] };
}

/**
 * An object closed and every key required, the optional ones nullable. An object with no `properties` (the drafts'
 * `script.params`, any key) cannot be said strictly: it closes to `{}`, so a Codex session gives no params.
 */
function strictObject(node: Node): Node {
  const properties = isNode(node.properties) ? node.properties : {};
  const required: readonly unknown[] = Array.isArray(node.required) ? node.required : [];
  const strict = Object.fromEntries(
    Object.entries(properties).map(([key, value]) => {
      const inner = strictNode(value);
      return [key, required.includes(key) ? inner : nullable(inner)];
    }),
  );
  return { ...node, properties: strict, required: Object.keys(strict), additionalProperties: false };
}

/** One subschema, and those under it: `items`, the members of `anyOf`, the definitions; refused keywords dropped. */
function strictNode(value: unknown): unknown {
  if (!isNode(value)) return value;
  const kept = Object.entries(value).filter(([key]) => !NOT_STRICT.has(key));
  const node = Object.fromEntries(
    kept.map(([key, inner]) => {
      if (key === 'items') return [key, strictNode(inner)];
      if (key === 'anyOf' && Array.isArray(inner)) return [key, inner.map(strictNode)];
      if (key === '$defs' && isNode(inner)) return [key, mapValues(inner, strictNode)];
      return [key, inner];
    }),
  );
  return node.type === 'object' || node.properties !== undefined ? strictObject(node) : node;
}

/** The core's schema as the API's strict structured output takes it; its top is an object, as the API wants. */
export function strictSchemaOf(schema: JsonSchema): JsonSchema {
  const strict = strictNode(schema);
  return isNode(strict) ? strict : schema;
}

/**
 * The answer as the core asked for it: a key the strict schema made nullable and the model left out comes back null,
 * and the core's zod refuses null where the key may only be absent. No schema of the core takes null today; one that
 * does would need this to follow the schema.
 */
export function withoutNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutNulls);
  if (!isNode(value)) return value;
  const present = Object.entries(value).filter(([, inner]) => inner !== null);
  return Object.fromEntries(present.map(([key, inner]) => [key, withoutNulls(inner)]));
}
