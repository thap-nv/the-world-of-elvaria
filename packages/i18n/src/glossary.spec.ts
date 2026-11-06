import { describe, expect, it } from 'vitest';

import { glossaryProblems } from './glossary-problems.ts';
import { GLOSSARY, bannedWords, glossaryTable, glossaryTables, idsOf } from './glossary.ts';
import type { Glossary, GlossaryTable } from './glossary.ts';

const BANNED: GlossaryTable = {
  table: 'banned',
  columns: [
    { key: 'words', header: 'Từ cấm', ids: ', ' },
    { key: 'use', header: 'Dùng thay' },
  ],
  rows: [
    { words: ['dispatcher'], use: '`steward`' },
    { words: ['budget'], words_note: 'khi nói về mức mana', use: '`mana`', scan: false },
  ],
};
const FANCY: GlossaryTable = {
  table: 'fancy',
  columns: [
    { key: 'words', header: 'Id', ids: ', ' },
    { key: 'use', header: 'Dùng thay', ids: ', ' },
  ],
  rows: [{ words: ['exorcise'], use: ['fix'] }],
};

/** A small valid glossary; each test breaks one rule of it. */
function glossary(overrides: Partial<Glossary> = {}): Glossary {
  return {
    version: 1,
    title: 'Glossary',
    blocks: ['Intro.', { list: ['one rule'] }],
    sections: [{ heading: '14. Banned', blocks: [BANNED, 'Fancy ids:', FANCY] }],
    ...overrides,
  };
}

describe('the shipped glossary.json', () => {
  it('has no shape problems', () => {
    expect(glossaryProblems(GLOSSARY)).toEqual([]);
  });

  it('bans dispatcher in favour of steward, and scans the fancy ids too (ADR 0014)', () => {
    const words = bannedWords(GLOSSARY);
    expect(words).toContainEqual({ word: 'dispatcher', use: 'steward', scan: true });
    expect(words).toContainEqual({ word: 'exorcise', use: 'fix', scan: true });
  });

  it('leaves to review the words banned in one sense only', () => {
    const unscanned = bannedWords(GLOSSARY).filter((word) => !word.scan);
    expect(unscanned.map((word) => word.word).sort()).toEqual(['agent', 'budget']);
  });

  it('names the quest statuses of the state machine (§2.5)', () => {
    const table = glossaryTable(GLOSSARY, 'quest_statuses');
    expect(table && idsOf(table, 'id')).toContain('awaiting_seal');
  });
});

describe('glossary accessors', () => {
  it('finds tables in document order, before and inside sections', () => {
    const intro: GlossaryTable = { ...FANCY, table: 'intro' };
    const tables = glossaryTables(glossary({ blocks: [intro] }));
    expect(tables.map((table) => table.table)).toEqual(['intro', 'banned', 'fancy']);
    expect(glossaryTable(glossary(), 'nope')).toBeUndefined();
  });

  it('reads the ids of one column, skipping rows that hold none', () => {
    const table: GlossaryTable = { ...BANNED, rows: [...BANNED.rows, { words: 'not a list', use: '' }] };
    expect(idsOf(table, 'words')).toEqual(['dispatcher', 'budget']);
  });

  it('turns the replacement into plain text, whatever the column holds', () => {
    expect(bannedWords(glossary())).toEqual([
      { word: 'dispatcher', use: 'steward', scan: true },
      { word: 'budget', use: 'mana', scan: false },
      { word: 'exorcise', use: 'fix', scan: true },
    ]);
    const odd = {
      ...BANNED,
      rows: [
        { words: ['x'], use: true },
        { words: 'y', use: '' },
      ],
    };
    expect(bannedWords(glossary({ sections: [{ heading: 'h', blocks: [odd, FANCY] }] }))[0]).toEqual({
      word: 'x',
      use: '',
      scan: true,
    });
  });
});

describe('glossaryProblems', () => {
  it('accepts the small glossary', () => {
    expect(glossaryProblems(glossary())).toEqual([]);
  });

  it('reports the version and a heading level the renderer cannot print', () => {
    const sections = [...glossary().sections, { heading: 'Deep', level: 4, blocks: [] }];
    expect(glossaryProblems(glossary({ version: 2, sections }))).toEqual([
      'glossary: version 2, expected 1',
      '"Deep": level 2 or 3',
    ]);
  });

  it('needs the banned and fancy tables, once each, with snake_case ids', () => {
    const sections = [{ heading: 'h', blocks: [BANNED, BANNED, { ...FANCY, table: 'Fancy-Ids' }] }];
    expect(glossaryProblems(glossary({ sections }))).toEqual([
      'table "banned" appears twice',
      'table "fancy" is missing: docs:check reads the banned words from it',
      'table "Fancy-Ids": id is not snake_case',
    ]);
  });

  it('reports cells that do not fit their column', () => {
    const rows = [
      { words: 'dispatcher', use: '`steward`' },
      { words: ['two words', 'ok', 'a|b'], use: ['steward'] },
    ];
    const sections = [{ heading: 'h', blocks: [{ ...BANNED, rows }, FANCY] }];
    expect(glossaryProblems(glossary({ sections }))).toEqual([
      'banned[0].words: expected a list of ids',
      'banned[1].words: not an id: two words, a|b',
      'banned[1].use: expected Markdown text',
    ]);
  });

  it('allows notes on ids columns and boolean flags, nothing else outside the columns', () => {
    const rows = [
      { words: ['a'], use: 'x', words_note: 'ok', scan: false },
      { words: ['b'], use: 'x', use_note: 'use is not an ids column', extra: 'no' },
      { words: ['c'], use: 'x', words_note: ['not text'] },
    ];
    const columns = [...BANNED.columns, ...BANNED.columns];
    const sections = [
      {
        heading: 'h',
        blocks: [
          { ...BANNED, rows },
          { ...FANCY, columns },
        ],
      },
    ];
    expect(glossaryProblems(glossary({ sections }))).toEqual([
      'banned[1].use_note: not a column, an ids note or a flag',
      'banned[1].extra: not a column, an ids note or a flag',
      'banned[2].words_note: not a column, an ids note or a flag',
      'fancy: two columns share a key',
      'fancy[0].use: expected Markdown text',
      'fancy[0].use: expected Markdown text',
    ]);
  });
});
