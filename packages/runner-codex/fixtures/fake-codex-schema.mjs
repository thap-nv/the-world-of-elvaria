// The API's side of `--output-schema` for fake-codex.mjs: OpenAI's strict structured output (`codex_output_schema`)
// refuses a schema outside its subset before any model call, and a model under it writes every key of `properties`.
// The rules are those of OpenAI's Structured Outputs guide ("Supported schemas"), plus `uniqueItems`, which the guide
// does not name. Two messages are the ones Codex 0.169.0-alpha.11.1 printed (2026-11-14): a key missing from the top's
// `required` (gpt-6.1-sol, §11 of that day) and `uniqueItems` (gpt-6-luna, live run of fix/codex-output-schema); the
// others follow their shape. Written apart from runner-codex's strict-schema.ts, so that the adapter is checked, not
// echoed.
const NOT_PERMITTED = [
  'allOf',
  'not',
  'if',
  'then',
  'else',
  'dependentRequired',
  'dependentSchemas',
  'uniqueItems',
];

const isNode = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
const isObject = (node) => node.type === 'object' || node.properties !== undefined;
const at = (steps) => `'${['schema', ...steps].join('.')}'`;

/** The first rule an object breaks, or undefined. */
function objectRefusal(node, steps) {
  if (node.additionalProperties !== false)
    return `${at([...steps, 'additionalProperties'])} is required to be supplied and to be false.`;
  const required = Array.isArray(node.required) ? node.required : [];
  const missing = Object.keys(node.properties ?? {}).find((key) => !required.includes(key));
  if (missing === undefined) return undefined;
  return `${at([...steps, 'required'])} is required to include every key in properties. Missing '${missing}'.`;
}

/** The subschemas under `node`, with the steps that name them. */
const below = (node) => [
  ...Object.entries(node.properties ?? {}).map(([key, value]) => [['properties', key], value]),
  [['items'], node.items],
  ...(Array.isArray(node.anyOf) ? node.anyOf : []).map((value, index) => [['anyOf', String(index)], value]),
  ...Object.entries(node.$defs ?? {}).map(([key, value]) => [['$defs', key], value]),
];

function refusalAt(node, steps) {
  if (!isNode(node)) return undefined;
  const banned = Object.keys(node).find((key) => NOT_PERMITTED.includes(key));
  if (banned !== undefined) return `${at([...steps, banned])} is not permitted when strict is true.`;
  const own = isObject(node) ? objectRefusal(node, steps) : undefined;
  if (own !== undefined) return own;
  for (const [more, value] of below(node)) {
    const refusal = refusalAt(value, [...steps, ...more]);
    if (refusal !== undefined) return refusal;
  }
  return undefined;
}

/**
 * The `message` of the stream's `error` and `turn.failed` lines when the API refuses the schema, a 400 before any
 * model call (the API's own error object, as Codex prints it); undefined when it takes the schema.
 */
export function schemaRefusal(schema) {
  const refusal =
    isNode(schema) && schema.type === 'object' && schema.anyOf === undefined
      ? refusalAt(schema, [])
      : `${at(['type'])} must be 'object'.`;
  if (refusal === undefined) return undefined;
  const message = `Invalid schema for response_format 'codex_output_schema': ${refusal}`;
  const error = {
    message,
    type: 'invalid_request_error',
    param: 'text.format.schema',
    code: 'invalid_json_schema',
  };
  return JSON.stringify({ type: 'error', error, status: 400 });
}

/** The answer a strict model writes: every top-level key of the schema, null for those `answer` leaves out. */
export function strictAnswer(answer, schema) {
  const keys = Object.keys(schema.properties ?? {});
  return { ...Object.fromEntries(keys.map((key) => [key, null])), ...answer };
}
