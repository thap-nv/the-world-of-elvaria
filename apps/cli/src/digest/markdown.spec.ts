import type { AttentionItem } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { digestMarkdown } from './markdown.ts';

const ITEM: AttentionItem = {
  kind: 'temple_off',
  group: 'can_wait',
  advice: 'enable_temple',
  command: [],
  count: 2,
  temple_reasons: ['disabled'],
};

describe('daily heals in digest Markdown', () => {
  it.each([
    ['vi', 'Chữa: 2 lần, 1 lần chữa khỏi.', 'Không có việc nào chờ bạn.'],
    ['en', 'Heals: 2 total, 1 healed.', 'Nothing waits for you.'],
  ] as const)('prints one heal line after the summary in %s', (locale, line, empty) => {
    const t = translator(locale);
    const base = { day: '2026-11-07', name: 'Elvaria', items: [ITEM] };
    const without = digestMarkdown(t, base).split('\n');
    const withHeals = digestMarkdown(t, { ...base, heals: { total: 2, healed: 1 } }).split('\n');
    expect(withHeals[3]).toBe(line);
    expect(withHeals.filter((value) => value === line)).toHaveLength(1);
    expect(withHeals.filter((value) => value !== line)).toEqual(without);
    expect(digestMarkdown(t, { ...base, items: [], heals: { total: 2, healed: 1 } }).split('\n')).toEqual([
      without[0],
      '',
      empty,
      line,
      '',
    ]);
    expect(digestMarkdown(t, { ...base, items: [] }).split('\n')).toEqual([without[0], '', empty, '']);
  });
});
