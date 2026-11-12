import { describe, expect, it } from 'vitest';

import { byNumber, headingsOf, labelOf, renderPlanIndex } from './docs-plan-index.mjs';

describe('headingsOf', () => {
  it('returns the ## and ### headings outside code fences, without their #', () => {
    const text = [
      '# Title',
      '## 2. Data',
      'text',
      '```md',
      '## 9. not a heading',
      '```',
      '### 2.1 Rules',
      '#### deep',
    ];
    expect(headingsOf(text.join('\n'))).toEqual(['2. Data', '2.1 Rules']);
  });
});

describe('labelOf', () => {
  it('names a section file by its numbered headings', () => {
    const text = '# Kế hoạch · §2\n\n---\n\n## 2. Data\n\n### 2.1 Rules\n\n### Notes\n';
    expect(labelOf('2-data.md', text)).toBe('§2 Data · §2.1 Rules');
  });

  it('names a done file by the §8 subsection it holds', () => {
    expect(labelOf('8-done-phase-0.md', '# x\n\n### Giai đoạn 0 — Base\n')).toBe(
      '§8, task đã xong: Giai đoạn 0 — Base',
    );
  });
});

describe('byNumber', () => {
  it('orders files by section number, 3.2 before 3.10, day files last by date', () => {
    const names = ['11-2026-11-07.md', '3.10-b.md', '8-done-ps.md', '3.2-a.md', '11-2026-11-06.md', 'x.md'];
    expect([...names, '2-c.md', '8-done-phase-0.md'].sort(byNumber)).toEqual([
      '2-c.md',
      '3.2-a.md',
      '3.10-b.md',
      '8-done-phase-0.md',
      '8-done-ps.md',
      '11-2026-11-06.md',
      '11-2026-11-07.md',
      'x.md',
    ]);
  });
});

describe('renderPlanIndex', () => {
  const files: Record<string, string> = {
    'docs/implementation-plan.md': '# Plan\n',
    'docs/implementation-plan/3.1-steward.md': '# x\n\n### 3.1 Steward | lock\n',
    'docs/implementation-plan/1-repo.md': '# x\n\n## 1. Repo\n',
    'docs/implementation-plan/11-2026-11-07.md': '# x\n',
    'docs/implementation-plan/11-2026-11-06.md': '# x\n',
    'docs/implementation-plan/old/9-risks.md': '## 9. Not listed\n',
    'docs/glossary.md': '## 1. Not listed\n',
  };
  const repo = { list: () => Object.keys(files), read: (file: string) => files[file] };

  it('lists the files of the folder in section order, escapes pipes, and puts the day files in one row', () => {
    expect(renderPlanIndex(repo)).toBe(
      [
        '| Mục | File |',
        '|---|---|',
        '| §1 Repo | [1-repo.md](implementation-plan/1-repo.md) |',
        String.raw`| §3.1 Steward \| lock | [3.1-steward.md](implementation-plan/3.1-steward.md) |`,
        '| §11 Nhật ký quyết định, mỗi ngày một file | [2026-11-06](implementation-plan/11-2026-11-06.md) · [2026-11-07](implementation-plan/11-2026-11-07.md) |',
        '',
      ].join('\n'),
    );
  });

  it('has no day row when there is no day file', () => {
    const one = { list: () => ['docs/implementation-plan/1-repo.md'], read: () => '## 1. Repo\n' };
    expect(renderPlanIndex(one)).not.toContain('§11');
  });
});
