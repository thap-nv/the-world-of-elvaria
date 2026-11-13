import { GLOSSARY } from '@elvaria/i18n';
import type { GlossaryColumn } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { GLOSSARY_SOURCE, renderCell, renderGlossary } from './docs-glossary.mjs';

const IDS: GlossaryColumn = { key: 'id', header: 'id', ids: ' / ' };

describe('renderCell', () => {
  it('prints ids as code joined by the column separator, then the note', () => {
    expect(renderCell(IDS, { id: ['returned', 'return'] })).toBe('`returned` / `return`');
    expect(renderCell(IDS, { id: ['contract'], id_note: '(vai)' })).toBe('`contract` (vai)');
  });

  it('prints the note alone without ids, and a dash when there is neither', () => {
    expect(renderCell(IDS, { id: [], id_note: 'theme' })).toBe('theme');
    expect(renderCell(IDS, { id: [] })).toBe('—');
  });

  it('prints Markdown columns as written, and nothing for a cell that is not text', () => {
    const column = { key: 'vi', header: 'VI' };
    expect(renderCell(column, { vi: 'Nhiếp chính' })).toBe('Nhiếp chính');
    expect(renderCell(column, { vi: true })).toBe('');
  });
});

describe('renderGlossary', () => {
  const text = renderGlossary();

  it('starts with the title and says where the glossary comes from', () => {
    expect(text.split('\n').slice(0, 3)).toEqual([
      '# Bảng thuật ngữ Elvaria',
      '',
      `> Sinh từ \`${GLOSSARY_SOURCE}\` bằng \`pnpm docs:gen\`, CI kiểm drift: sửa nguồn rồi chạy lại lệnh, không sửa file này.`,
    ]);
  });

  it('lays out sections, lists and tables', () => {
    expect(text).toContain(
      '\n## 1. Thế giới và vai hệ thống\n\n| VI | EN | id | Định nghĩa | Nơi dùng |\n|---|---|---|---|---|\n',
    );
    expect(text).toContain('\n### 7.1 Trạng thái quest (`quest.status`)\n');
    expect(text).toContain('\n- Identifier trong code dùng **đúng cột "id"**.');
    expect(text).toContain('| Nhiếp chính | Steward | `steward` |');
    expect(text).toContain('| `dispatcher` | `steward` |');
    expect(text.endsWith('|\n')).toBe(true);
  });

  it('refuses a glossary with shape problems', () => {
    expect(() => renderGlossary({ ...GLOSSARY, version: 2 })).toThrow(
      /glossary.json has problems: glossary: version 2/,
    );
  });
});
