// docs/glossary.md from packages/i18n/src/glossary.json (ADR 0014, implementation-plan §5.3): one source, two
// forms. Terms change in glossary.json; this renderer only lays them out.
import { GLOSSARY, glossaryProblems, isGlossaryTable, isIdList } from '@elvaria/i18n';

import { code, generatedNote, markdownDocument, table } from './docs-markdown.mjs';

/** @typedef {import('@elvaria/i18n').Glossary} Glossary */
/** @typedef {import('@elvaria/i18n').GlossaryBlock} GlossaryBlock */
/** @typedef {import('@elvaria/i18n').GlossaryColumn} GlossaryColumn */
/** @typedef {import('@elvaria/i18n').GlossaryRow} GlossaryRow */

export const GLOSSARY_SOURCE = 'packages/i18n/src/glossary.json';

/**
 * Ids print as code joined by the column's separator, then the row's note; no id and no note prints `—`.
 * @param {GlossaryColumn} column
 * @param {GlossaryRow} row
 */
export function renderCell(column, row) {
  const value = row[column.key];
  if (column.ids === undefined) return typeof value === 'string' ? value : '';
  const ids = isIdList(value) ? value.map(code).join(column.ids) : '';
  const note = row[`${column.key}_note`];
  const parts = [ids, typeof note === 'string' ? note : ''].filter((part) => part !== '');
  return parts.length === 0 ? '—' : parts.join(' ');
}

/** @param {GlossaryBlock} block */
function renderBlock(block) {
  if (typeof block === 'string') return block;
  if (isGlossaryTable(block)) {
    const rows = block.rows.map((row) => block.columns.map((column) => renderCell(column, row)));
    return table(
      block.columns.map((column) => column.header),
      rows,
    );
  }
  return block.list.map((item) => `- ${item}`).join('\n');
}

/**
 * The text of docs/glossary.md. Throws on a glossary with shape problems: `pnpm i18n:check` lists them.
 * @param {Glossary} glossary
 */
export function renderGlossary(glossary = GLOSSARY) {
  const problems = glossaryProblems(glossary);
  if (problems.length > 0) throw new Error(`${GLOSSARY_SOURCE} has problems: ${problems.join('; ')}`);
  return markdownDocument([
    `# ${glossary.title}`,
    generatedNote(code(GLOSSARY_SOURCE)),
    ...glossary.blocks.map(renderBlock),
    ...glossary.sections.flatMap((section) => [
      `${'#'.repeat(section.level ?? 2)} ${section.heading}`,
      ...section.blocks.map(renderBlock),
    ]),
  ]);
}
