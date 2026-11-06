// The glossary (ADR 0014, implementation-plan §5.3): the one machine-readable source of every term. `pnpm
// docs:gen` renders docs/glossary.md from it and `pnpm docs:check` reads the banned words from it, so a term
// changes here and nowhere else.
import glossaryJson from './glossary.json' with { type: 'json' };

/** An ids column holds a list of identifiers (rendered as code); every other column holds Markdown. */
export type GlossaryCell = string | readonly string[] | boolean;

export interface GlossaryColumn {
  readonly key: string;
  readonly header: string;
  /** Marks an ids column: the separator printed between its ids. */
  readonly ids?: string | undefined;
}

/**
 * One row, keyed by column. Besides the columns: `<ids column>_note`, Markdown printed after the ids
 * (`contract` (vai)), and boolean flags that tools read and the Markdown leaves out (`scan`).
 */
export type GlossaryRow = Readonly<Record<string, GlossaryCell | undefined>>;

export interface GlossaryTable {
  /** Stable id, so tools find a table without counting headings (`banned`, `quest_statuses`). */
  readonly table: string;
  readonly columns: readonly GlossaryColumn[];
  readonly rows: readonly GlossaryRow[];
}

export interface GlossaryList {
  readonly list: readonly string[];
}

/** A paragraph (Markdown), a bullet list or a table. */
export type GlossaryBlock = string | GlossaryList | GlossaryTable;

export interface GlossarySection {
  readonly heading: string;
  /** Markdown heading level: 2 when absent, 3 for a subsection. */
  readonly level?: number | undefined;
  readonly blocks: readonly GlossaryBlock[];
}

export interface Glossary {
  readonly version: number;
  readonly title: string;
  /** What comes before the first section. */
  readonly blocks: readonly GlossaryBlock[];
  readonly sections: readonly GlossarySection[];
}

export const GLOSSARY: Glossary = glossaryJson;

/** Ids of the two tables `pnpm docs:check` reads its banned words from. */
export const BANNED_TABLE = 'banned';
export const FANCY_TABLE = 'fancy';

export const isGlossaryTable = (block: GlossaryBlock): block is GlossaryTable =>
  typeof block === 'object' && 'table' in block;

export const isIdList = (cell: GlossaryCell | undefined): cell is readonly string[] => Array.isArray(cell);

/** Every table, in document order. */
export function glossaryTables(glossary: Glossary): GlossaryTable[] {
  return [glossary.blocks, ...glossary.sections.map((section) => section.blocks)]
    .flat()
    .filter(isGlossaryTable);
}

export function glossaryTable(glossary: Glossary, id: string): GlossaryTable | undefined {
  return glossaryTables(glossary).find((table) => table.table === id);
}

/** Every id in one ids column of a table, in row order. */
export function idsOf(table: GlossaryTable, column: string): string[] {
  return table.rows.flatMap((row) => {
    const cell = row[column];
    return isIdList(cell) ? cell : [];
  });
}

export interface BannedWord {
  readonly word: string;
  /** What to write instead, as plain text. */
  readonly use: string;
  /** False for a word banned only in one sense (`budget` for mana): review catches it, a scan cannot. */
  readonly scan: boolean;
}

const plainText = (cell: GlossaryCell | undefined): string => {
  if (isIdList(cell)) return cell.join(', ');
  return typeof cell === 'string' ? cell.replaceAll('`', '') : '';
};

/** The words identifiers may not use (glossary §14): the banned table, then the fancy ids. */
export function bannedWords(glossary: Glossary): BannedWord[] {
  return [BANNED_TABLE, FANCY_TABLE].flatMap((id) =>
    (glossaryTable(glossary, id)?.rows ?? []).flatMap((row) => {
      const words = row.words;
      return isIdList(words)
        ? words.map((word) => ({ word, use: plainText(row.use), scan: row.scan !== false }))
        : [];
    }),
  );
}
