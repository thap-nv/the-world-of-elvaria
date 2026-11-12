import { describe, expect, it } from 'vitest';

import {
  DONE_FILES,
  SECTION_FILES,
  blocksOf,
  dayRows,
  dayText,
  doneText,
  indexHead,
  moveDone,
  partText,
  sectionFile,
} from './plan-layout.mjs';

const HEADER = ['| # | Task | File chạm | Xong khi | Trạng thái |', '|---|---|---|---|---|'];
const row = (id: string, status: string) => `| ${id} | a \\| b | f | d | ${status} |`;

describe('blocksOf', () => {
  it('cuts at each section from the rule before its title, §3 at each subsection, never inside a fence', () => {
    const lines = [
      '# Plan',
      '',
      '---',
      '',
      '## 1. Repo',
      '```',
      '## 2. fenced',
      '```',
      '',
      '---',
      '',
      '## 3. Core',
    ];
    const more = [
      '',
      'Intro',
      '',
      '### 3.0 Facts',
      'x',
      '### 3.1 Steward',
      'y',
      '### 1.2 not cut',
      '',
      '## 8. Work',
    ];
    const blocks = blocksOf([...lines, ...more]);
    expect(blocks.map((block) => block.key)).toEqual(['preamble', '1', '3', '3.0', '3.1', '8']);
    expect(blocks[1]?.lines).toEqual(['---', '', '## 1. Repo', '```', '## 2. fenced', '```', '']);
    expect(blocks[2]?.lines).toEqual(['---', '', '## 3. Core', '', 'Intro', '']);
    expect(blocks[4]?.lines).toEqual(['### 3.1 Steward', 'y', '### 1.2 not cut', '']);
  });
});

describe('sectionFile', () => {
  it('names the file of a section, and says where to add one it does not know', () => {
    expect(sectionFile('3.4')).toBe('3.4-breakers.md');
    expect(sectionFile('3.17')).toEqual(
      new Error('§3.17 has no file: add it to SECTION_FILES of scripts/plan-layout.mjs'),
    );
  });

  it('gives every mechanism its own file, §3 with §3.0, and every done file the name docs-plan-index.mjs reads', () => {
    const files = [...SECTION_FILES.values()];
    expect(new Set(files).size).toBe(files.length - 1);
    expect(SECTION_FILES.get('3')).toBe(SECTION_FILES.get('3.0'));
    expect(files.every((file) => /^\d+(?:\.\d+)?-[a-z0-9-]+\.md$/.test(file))).toBe(true);
    expect(DONE_FILES.every(([, file]) => file.startsWith('8-done-'))).toBe(true);
  });
});

describe('partText', () => {
  it('titles a part by its own heading, says where it came from, then keeps its lines', () => {
    const text = partText(['3', '3.0'], ['---', '', '## 3. Core', '', '### 3.0 Facts', 'x', '', '']);
    expect(text.split('\n').slice(0, 3)).toEqual([
      '# Kế hoạch triển khai Elvaria · §3.0 Facts',
      '',
      expect.stringContaining('P1-52'),
    ]);
    expect(text.endsWith('\n---\n\n## 3. Core\n\n### 3.0 Facts\nx\n')).toBe(true);
  });
});

describe('moveDone', () => {
  const section = [
    '## 8. Work',
    '',
    '| Đợt | Task | Cần xong trước |',
    '|---|---|---|',
    '| A | xong | — |',
    '',
    '### Giai đoạn 0 — Base',
    '',
    ...HEADER,
    row('P0-01', 'xong (2026-11-06, abc)'),
    '',
    '### Giai đoạn 1 — Real',
    '',
    ...HEADER,
    row('P1-01', 'xong (2026-11-07, def); CLI `a \\| b`'),
    row('P1-02', 'chưa làm'),
    '',
  ];

  it('takes the done rows out by subsection, and leaves a pointer where each table starts', () => {
    const moved = moveDone(section);
    if (moved instanceof Error) throw moved;
    expect(moved.lines.slice(0, 6)).toEqual(section.slice(0, 6));
    expect(moved.lines.slice(6)).toEqual([
      '### Giai đoạn 0 — Base',
      '',
      'Dòng của task đã xong ở [8-done-phase-0.md](implementation-plan/8-done-phase-0.md).',
      '',
      '### Giai đoạn 1 — Real',
      '',
      'Dòng của task đã xong ở [8-done-phase-1.md](implementation-plan/8-done-phase-1.md).',
      '',
      ...HEADER,
      row('P1-02', 'chưa làm'),
      '',
    ]);
    expect(moved.done.get('8-done-phase-1.md')).toEqual({
      heading: '### Giai đoạn 1 — Real',
      header: HEADER,
      rows: [row('P1-01', 'xong (2026-11-07, def); CLI `a \\| b`')],
      emptied: false,
    });
    expect(moved.done.get('8-done-phase-0.md')?.emptied).toBe(true);
  });

  it('adds no second pointer when run again, and moves nothing when nothing is done', () => {
    const once = moveDone(section);
    if (once instanceof Error) throw once;
    const twice = moveDone(once.lines.map((line) => line.replace('chưa làm', 'xong (2026-11-12, 123)')));
    if (twice instanceof Error) throw twice;
    expect(twice.lines.filter((line) => line.startsWith('Dòng của task'))).toHaveLength(2);
    expect(twice.lines.filter((line) => line.startsWith('| P1-'))).toEqual([]);
    expect(moveDone(['## 8. Work', '### Giai đoạn 9', ...HEADER, row('P9-01', 'chưa làm')])).toMatchObject({
      done: new Map(),
    });
  });

  it('refuses done rows of a subsection that has no done file', () => {
    expect(moveDone(['### Giai đoạn 9 — New', ...HEADER, row('P9-01', 'xong')])).toEqual(
      new Error('§8 "### Giai đoạn 9 — New" has done rows but no file in DONE_FILES'),
    );
  });
});

describe('dayRows', () => {
  const log = ['---', '', '## 11. Log', '', '| Ngày | Quyết định |', '|---|---|'];

  it('groups the rows by their date, keeps the head with the rule for new rows', () => {
    const days = dayRows([...log, '| 2026-11-06 | a |', '| 2026-11-07 | b |', '| 2026-11-06 | c |', '']);
    if (days instanceof Error) throw days;
    expect([...days.days]).toEqual([
      ['2026-11-06', ['| 2026-11-06 | a |', '| 2026-11-06 | c |']],
      ['2026-11-07', ['| 2026-11-07 | b |']],
    ]);
    expect(days.header).toEqual(['| Ngày | Quyết định |', '|---|---|']);
    expect(days.lines.slice(0, 4)).toEqual(['---', '', '## 11. Log', '']);
    expect(days.lines[4]).toMatch(/^Các dòng của nhật ký nằm ở/);
  });

  it('refuses a §11 without its table, a row without a date and a line after the table', () => {
    expect(dayRows(['## 11. Log'])).toBeInstanceOf(Error);
    expect(dayRows([...log, '| soon | a |'])).toEqual(
      new Error('§11 has a row without a date: | soon | a |'),
    );
    expect(dayRows([...log, '| 2026-11-06 | a |', '', 'Note'])).toEqual(
      new Error('§11 has a line after its table: Note'),
    );
  });
});

describe('the files around the moved lines', () => {
  it('heads a day file and a done file so that the next one is copied from it', () => {
    expect(dayText('2026-11-13', ['| Ngày | Quyết định |', '|---|---|'], ['| 2026-11-13 | a |'])).toMatch(
      /^# Kế hoạch triển khai Elvaria · §11 Nhật ký quyết định, 2026-11-13\n\n.+\n\n\| Ngày \| Quyết định \|\n\|---\|---\|\n\| 2026-11-13 \| a \|\n$/,
    );
    const done = doneText('### Giai đoạn 0 — Base', HEADER, [row('P0-01', 'xong')]);
    expect(done.split('\n').slice(0, 1)).toEqual([
      '# Kế hoạch triển khai Elvaria · §8, task đã xong: Giai đoạn 0 — Base',
    ]);
    expect(done.endsWith(`### Giai đoạn 0 — Base\n\n${HEADER.join('\n')}\n${row('P0-01', 'xong')}\n`)).toBe(
      true,
    );
  });

  it('puts the contents table, empty until rendered, and the rules for writing after the preamble', () => {
    const head = indexHead(['# Plan', '', 'Intro', '', '']);
    expect(head.slice(0, 7)).toEqual(['# Plan', '', 'Intro', '', '---', '', '## Mục lục']);
    expect(head).toContain('<!-- docs:gen plan-index -->');
    expect(head.indexOf('<!-- /docs:gen plan-index -->') - head.indexOf('<!-- docs:gen plan-index -->')).toBe(
      1,
    );
    expect(head).toContain('**Ghi vào đâu.**');
  });
});
