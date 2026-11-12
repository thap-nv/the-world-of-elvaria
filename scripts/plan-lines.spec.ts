import { describe, expect, it } from 'vitest';

import { compareLines, rebaseLines } from './plan-lines.mjs';

const PLAN = 'docs/implementation-plan.md';
const PART = 'docs/implementation-plan/3.4-breakers.md';

describe('rebaseLines', () => {
  it('rewrites relative targets so they reach the same file one folder down, link text untouched', () => {
    expect(
      rebaseLines(
        [
          'See [guides/a.md](guides/a.md), [`CLAUDE.md`](../CLAUDE.md) and [schemas](schemas/).',
          '![map](<my map.png> "Map") and [ADR](adr/0001-x.md#status)',
          '[plan](implementation-plan.md)',
        ],
        PLAN,
        PART,
      ),
    ).toEqual([
      'See [guides/a.md](../guides/a.md), [`CLAUDE.md`](../../CLAUDE.md) and [schemas](../schemas/).',
      '![map](<../my map.png> "Map") and [ADR](../adr/0001-x.md#status)',
      '[plan](../implementation-plan.md)',
    ]);
  });

  it('leaves the web, mail, anchors, root paths, code spans and code fences alone', () => {
    const lines = [
      '[w](https://example.com) [m](mailto:a@b.c) [h](#here) [r](/CLAUDE.md) `[c](code.md)`',
      '```md',
      '[f](fenced.md)',
      '```',
    ];
    expect(rebaseLines(lines, PLAN, PART)).toEqual(lines);
  });

  it('changes nothing between files of one folder, and climbs back up the other way', () => {
    expect(rebaseLines(['[a](guides/a.md)'], PLAN, 'docs/glossary.md')).toEqual(['[a](guides/a.md)']);
    expect(rebaseLines(['[a](../guides/a.md)'], PART, PLAN)).toEqual(['[a](guides/a.md)']);
  });
});

describe('compareLines', () => {
  const before = new Map([[PLAN, '# T\n\nSee [a](guides/a.md).\nSame\nSame\n']]);

  it('counts a moved line with its link rebased as the same line, and reports what was added', () => {
    const after = new Map([
      [PLAN, '# T\n\nSame\n'],
      [PART, '# Part\n\nSee [a](../guides/a.md).\nSame\n'],
    ]);
    expect(compareLines(before, after)).toEqual({ lines: 4, lost: [], added: ['# Part'] });
  });

  it('reports a line that is gone, and a repeated line kept fewer times', () => {
    const after = new Map([[PART, '# T\nSame\n']]);
    expect(compareLines(before, after).lost).toEqual(['See [a](/docs/guides/a.md).', 'Same']);
  });

  it('counts the lines meant to go as kept', () => {
    const after = new Map([[PART, '# T\nSee [a](../guides/a.md).\nSame\n']]);
    expect(compareLines(before, after, ['Same'])).toMatchObject({ lost: [], added: [] });
  });

  it('reports a link that moved without its target following', () => {
    const after = new Map([[PART, '# T\nSee [a](guides/a.md).\nSame\nSame\n']]);
    expect(compareLines(before, after)).toMatchObject({
      lost: ['See [a](/docs/guides/a.md).'],
      added: ['See [a](/docs/implementation-plan/guides/a.md).'],
    });
  });
});
