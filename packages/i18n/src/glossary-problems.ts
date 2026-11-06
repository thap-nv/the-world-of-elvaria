// The shape rules of glossary.json that its TypeScript type cannot state; `pnpm i18n:check` reports them, and
// docs:gen renders only a glossary without problems.
import { BANNED_TABLE, FANCY_TABLE, glossaryTables, isIdList } from './glossary.ts';
import type { Glossary, GlossaryRow, GlossaryTable } from './glossary.ts';

const GLOSSARY_VERSION = 1;
const HEADING_LEVELS: readonly number[] = [2, 3];
const TABLE_ID = /^[a-z_]+$/;
/** An id is printed inside a code span in a table cell, so it cannot hold whitespace, a backtick or a pipe. */
const ID_IN_CELL = /^[^\s`|]+$/;
const NOTE_SUFFIX = '_note';

/** Problems of one cell against its column: ids columns hold id lists, the others Markdown. */
function cellProblem(where: string, cell: GlossaryRow[string], ids: boolean): string | undefined {
  if (!ids) return typeof cell === 'string' ? undefined : `${where}: expected Markdown text`;
  if (!isIdList(cell)) return `${where}: expected a list of ids`;
  const bad = cell.filter((id) => !ID_IN_CELL.test(id));
  return bad.length === 0 ? undefined : `${where}: not an id: ${bad.join(', ')}`;
}

/** Keys outside the columns: a string note after an ids column, or a boolean flag for tools. */
function extraKeyProblem(table: GlossaryTable, where: string, key: string, value: GlossaryRow[string]) {
  if (typeof value === 'boolean') return undefined;
  const noted = key.endsWith(NOTE_SUFFIX) ? key.slice(0, -NOTE_SUFFIX.length) : undefined;
  const idsColumn = table.columns.some((column) => column.key === noted && column.ids !== undefined);
  if (idsColumn && typeof value === 'string') return undefined;
  return `${where}.${key}: not a column, an ids note or a flag`;
}

function rowProblems(table: GlossaryTable, row: GlossaryRow, index: number): string[] {
  const where = `${table.table}[${index}]`;
  const keys = new Set(table.columns.map((column) => column.key));
  const fromColumns = table.columns.map((column) =>
    cellProblem(`${where}.${column.key}`, row[column.key], column.ids !== undefined),
  );
  const fromExtras = Object.entries(row)
    .filter(([key]) => !keys.has(key))
    .map(([key, value]) => extraKeyProblem(table, where, key, value));
  return [...fromColumns, ...fromExtras].filter((problem) => problem !== undefined);
}

function tableProblems(table: GlossaryTable): string[] {
  const keys = table.columns.map((column) => column.key);
  const problems = TABLE_ID.test(table.table) ? [] : [`table "${table.table}": id is not snake_case`];
  if (new Set(keys).size !== keys.length) problems.push(`${table.table}: two columns share a key`);
  return [...problems, ...table.rows.flatMap((row, index) => rowProblems(table, row, index))];
}

/** Every problem of the glossary; empty when docs:gen may render it and docs:check may read it. */
export function glossaryProblems(glossary: Glossary): string[] {
  const problems: string[] = [];
  if (glossary.version !== GLOSSARY_VERSION) {
    problems.push(`glossary: version ${glossary.version}, expected ${GLOSSARY_VERSION}`);
  }
  for (const section of glossary.sections) {
    if (!HEADING_LEVELS.includes(section.level ?? 2)) problems.push(`"${section.heading}": level 2 or 3`);
  }
  const tables = glossaryTables(glossary);
  const ids = tables.map((table) => table.table);
  for (const id of new Set(ids.filter((name, index) => ids.indexOf(name) !== index))) {
    problems.push(`table "${id}" appears twice`);
  }
  for (const id of [BANNED_TABLE, FANCY_TABLE].filter((name) => !ids.includes(name))) {
    problems.push(`table "${id}" is missing: docs:check reads the banned words from it`);
  }
  return [...problems, ...tables.flatMap(tableProblems)];
}
