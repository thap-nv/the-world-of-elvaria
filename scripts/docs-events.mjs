// docs/events.md: the event type catalogue and each type's `data`, from the domain (implementation-plan §5.4).
// It reads the same JSON Schema that `pnpm schemas` writes, so the two documents cannot disagree.
import { CONTRACTS, EVENT_TYPES, contractOf } from '@elvaria/domain';

import { code, generatedNote, markdownDocument, table } from './docs-markdown.mjs';

/** @typedef {Record<string, unknown>} Json */

/** @param {unknown} value @returns {value is Json} */
const isJson = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

/** @param {unknown} value @returns {unknown[]} */
const listOf = (value) => (Array.isArray(value) ? value : []);

/** @param {unknown} value */
const text = (value) => (typeof value === 'string' ? value : JSON.stringify(value));

/** ` ≥ 0`, ` 0–100`, ` ≤ 5` or nothing. @param {Json} node */
function rangeOf(node) {
  const { minimum: min, maximum: max } = node;
  if (min !== undefined && max !== undefined) return ` ${text(min)}–${text(max)}`;
  if (min !== undefined) return ` ≥ ${text(min)}`;
  return max === undefined ? '' : ` ≤ ${text(max)}`;
}

/** @param {Json} node */
function stringOf(node) {
  const not = isJson(node.not) ? listOf(node.not.enum).map((value) => code(text(value))) : [];
  const shape = [
    typeof node.format === 'string' ? node.format : '',
    typeof node.pattern === 'string' ? `khớp ${code(node.pattern)}` : '',
    node.minLength === 1 ? 'không rỗng' : '',
    not.length > 0 ? `khác ${not.join(', ')}` : '',
  ].filter((part) => part !== '');
  return shape.length === 0 ? 'string' : `string (${shape.join(', ')})`;
}

/** @param {Json} node */
function objectOf(node) {
  const properties = isJson(node.properties) ? Object.keys(node.properties) : [];
  if (properties.length === 0) return 'object';
  const required = listOf(node.required);
  return `object { ${properties.map((name) => (required.includes(name) ? name : `${name}?`)).join(', ')} }`;
}

/** A short summary of one JSON Schema node, for a table cell. @param {unknown} node @returns {string} */
export function typeOf(node) {
  if (!isJson(node)) return 'bất kỳ';
  if ('const' in node) return code(JSON.stringify(node.const));
  if (Array.isArray(node.enum)) return `một trong ${node.enum.map((value) => code(text(value))).join(', ')}`;
  if (Array.isArray(node.type)) return node.type.map((type) => typeOf({ ...node, type })).join(' hoặc ');
  if (node.type === 'string') return stringOf(node);
  if (node.type === 'integer' || node.type === 'number') return `${node.type}${rangeOf(node)}`;
  if (node.type === 'object') return objectOf(node);
  if (node.type === 'array') return `array of ${typeOf(node.items)}`;
  return typeof node.type === 'string' ? node.type : 'bất kỳ';
}

/** One property of an object schema as a cell line: name, optional mark, type, description. @param {Json} schema */
function fieldsOf(schema) {
  const properties = isJson(schema.properties) ? Object.entries(schema.properties) : [];
  const required = listOf(schema.required);
  return properties.map(([name, node]) => {
    const optional = required.includes(name) ? '' : ' (tùy chọn)';
    const description = isJson(node) && typeof node.description === 'string' ? ` — ${node.description}` : '';
    return `${code(name)}${optional}: ${typeOf(node)}${description}`;
  });
}

/** `data` schema by event type, from the contract's `if type … then data …` rules. @param {Json} contract */
function dataSchemas(contract) {
  /** @type {Map<string, Json>} */
  const byType = new Map();
  for (const rule of listOf(contract.allOf).filter(isJson)) {
    const type = isJson(rule.if) && isJson(rule.if.properties) ? rule.if.properties.type : undefined;
    const data = isJson(rule.then) && isJson(rule.then.properties) ? rule.then.properties.data : undefined;
    if (!isJson(type) || !isJson(data)) continue;
    const types = 'const' in type ? [type.const] : listOf(type.enum);
    for (const name of types) byType.set(text(name), data);
  }
  return byType;
}

/** @param {Json} contract */
function envelopeTable(contract) {
  const required = listOf(contract.required);
  const properties = isJson(contract.properties) ? Object.entries(contract.properties) : [];
  const rows = properties.map(([name, node]) => [
    code(name),
    required.includes(name) ? 'có' : '',
    typeOf(node),
    isJson(node) && typeof node.description === 'string' ? node.description : '',
  ]);
  return table(['Trường', 'Bắt buộc', 'Kiểu', 'Mô tả'], rows);
}

/** @param {readonly string[]} types @param {Map<string, Json>} schemas */
function groupTables(types, schemas) {
  /** @type {Map<string, string[]>} */
  const groups = new Map();
  for (const type of types) {
    const group = type.split('.')[0] ?? type;
    groups.set(group, [...(groups.get(group) ?? []), type]);
  }
  return [...groups].flatMap(([group, members]) => [
    `## ${code(group)} · ${members.length} type`,
    table(
      ['Type', '`data`'],
      members.map((type) => {
        const schema = schemas.get(type);
        return [
          code(type),
          schema === undefined ? 'object mở, chưa có schema' : fieldsOf(schema).join('<br>'),
        ];
      }),
    ),
  ]);
}

/** The text of docs/events.md. */
export function renderEvents() {
  const contract = contractOf('event', CONTRACTS.event);
  const schemas = dataSchemas(contract);
  return markdownDocument([
    '# Danh mục event (v1)',
    generatedNote('`packages/domain` (`EVENT_TYPES`, `EventSchema`, `EVENT_DATA_SCHEMAS`)'),
    'Mỗi dòng của `events/YYYY-MM-DD.jsonl` và `quests/<id>/journal.jsonl` là một event; log chỉ ghi thêm, không bao giờ viết lại. `type` là `nhóm.hành_động`; reader giữ nguyên type lạ, renderer bỏ qua nó. Hợp đồng đầy đủ: [schemas/event.schema.json](schemas/event.schema.json); nghĩa từng nhóm và các tiền tố dành sẵn: [glossary.md](glossary.md) mục 12.',
    `${EVENT_TYPES.length} type trong danh mục v1, ${schemas.size} type có schema cho \`data\`; type khác ghi \`data\` là object mở (\`{}\` khi không có gì).`,
    '## Khung một dòng',
    envelopeTable(contract),
    ...groupTables(EVENT_TYPES, schemas),
  ]);
}
