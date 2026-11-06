// zod → the JSON Schema contracts in docs/schemas (ADR 0003). zod writes valid 2020-12 schemas but with its own
// habits; these rewrites keep the generated files as readable as the reviewed v1 originals.
import { z } from 'zod';

type JsonObject = Record<string, unknown>;

const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Keys in the order a person reads a contract: what it is, then its shape, then defaults and examples. */
const KEY_ORDER = [
  '$schema',
  '$id',
  'title',
  'description',
  '$comment',
  '$ref',
  'type',
  'const',
  'enum',
  'format',
  'pattern',
  'minLength',
  'maxLength',
  'minimum',
  'exclusiveMinimum',
  'maximum',
  'exclusiveMaximum',
  'minItems',
  'maxItems',
  'uniqueItems',
  'items',
  'contains',
  'minContains',
  'maxContains',
  'propertyNames',
  'additionalProperties',
  'required',
  'properties',
  'anyOf',
  'oneOf',
  'allOf',
  'if',
  'then',
  'else',
  'default',
  '$defs',
  'examples',
];
const rank = (key: string): number => {
  const index = KEY_ORDER.indexOf(key);
  return index === -1 ? KEY_ORDER.length : index;
};

/** `X | null` as one schema with `type: [X, "null"]`, the way the v1 contracts write it. */
function mergeNullable(node: JsonObject): JsonObject {
  const value = node.anyOf;
  if (!Array.isArray(value)) return node;
  const branches: readonly unknown[] = value;
  // Exactly two branches, one of them `null`.
  const [first, second, ...more] = branches;
  if (more.length > 0) return node;
  const isNull = (branch: unknown) => isJsonObject(branch) && branch.type === 'null';
  const other = isNull(second) ? first : isNull(first) ? second : undefined;
  if (!isJsonObject(other) || typeof other.type !== 'string') return node;
  const { anyOf: _anyOf, ...rest } = node;
  return { ...other, ...rest, type: [other.type, 'null'] };
}

/** Property names are always strings, so `propertyNames: { type: "string" }` says nothing; nor does `{}`. */
function withoutEmptyObjectKeywords(node: JsonObject): JsonObject {
  const { propertyNames, additionalProperties, ...rest } = node;
  const isEmpty = (value: unknown) => isJsonObject(value) && Object.keys(value).length === 0;
  const names = isJsonObject(propertyNames)
    ? Object.fromEntries(Object.entries(propertyNames).filter(([k, v]) => !(k === 'type' && v === 'string')))
    : propertyNames;
  return {
    ...rest,
    ...(names === undefined || isEmpty(names) ? {} : { propertyNames: names }),
    ...(additionalProperties === undefined || isEmpty(additionalProperties) ? {} : { additionalProperties }),
  };
}

/** One node: drop what zod adds by habit, then order the keys. */
function tidy(node: JsonObject): JsonObject {
  const merged = withoutEmptyObjectKeywords(mergeNullable(node));
  const kept = Object.entries(merged).filter(([key, value]) => {
    // z.int() states the safe-integer range on every integer; the contracts do not.
    if ((key === 'maximum' || key === 'minimum') && Math.abs(Number(value)) === Number.MAX_SAFE_INTEGER) {
      return false;
    }
    // An enum or a const already says the type.
    if (key === 'type' && ('enum' in merged || 'const' in merged)) return false;
    // z.iso.datetime() adds its own regex next to `format`; the format is the contract.
    return !(key === 'pattern' && 'format' in merged);
  });
  const ordered = kept.sort(([a], [b]) => rank(a) - rank(b));
  return Object.fromEntries(ordered.map(([key, value]) => [key, keywordValue(key, value)]));
}

// JSON Schema 2020-12 keywords that hold one subschema, a list of them, or a map of names to them. Only these
// are rewritten: `properties` keeps its field order, and data (`default`, `const`, `enum`, `examples`) stays as
// written even when it happens to contain keys such as `type` or `pattern`.
const SCHEMA = new Set([
  'items',
  'contains',
  'propertyNames',
  'additionalProperties',
  'not',
  'if',
  'then',
  'else',
]);
const SCHEMA_LIST = new Set(['anyOf', 'oneOf', 'allOf', 'prefixItems']);
const SCHEMA_MAP = new Set(['properties', '$defs', 'patternProperties', 'dependentSchemas']);

function keywordValue(key: string, value: unknown): unknown {
  // RegExp#source escapes `/`; an unescaped `/` means the same and reads like the v1 patterns.
  if (key === 'pattern' && typeof value === 'string') return value.replaceAll('\\/', '/');
  if (SCHEMA.has(key)) return normalize(value);
  if (SCHEMA_LIST.has(key) && Array.isArray(value)) return value.map(normalize);
  if (SCHEMA_MAP.has(key) && isJsonObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([name, schema]) => [name, normalize(schema)]));
  }
  return value;
}

/** Rewrites a zod-generated JSON Schema into the contract style, following its subschemas. */
export function normalize(schema: unknown): unknown {
  return isJsonObject(schema) ? tidy(schema) : schema;
}

/** The contract file of one schema: JSON Schema 2020-12 with its `$id`, as `docs/schemas/<name>.schema.json`. */
export function contractOf(name: string, schema: z.ZodType): JsonObject {
  const generated = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input', unrepresentable: 'any' });
  const body = normalize(generated) as JsonObject;
  return normalize({ ...body, $id: `https://elvaria.dev/schemas/${name}/v1` }) as JsonObject;
}
