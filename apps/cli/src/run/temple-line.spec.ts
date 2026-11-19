// The console bell of a temple report (PS-12c): once per report, what it did to the scriptures and its letters, or that
// it was refused whole.
import { CharacterIdSchema } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { lineOf } from './bell.ts';
import type { Notice } from '@elvaria/steward';

const en = translator('en');
const vi = translator('vi');
const sage = CharacterIdSchema.parse('sage');
const APPLIED: Notice = { kind: 'temple', character: sage, added: 2, retired: 1, refused: 1, letters: 3 };

describe('the console bell of a temple report', () => {
  it('tells what the report wrote, what it refused and the letters it filed', () => {
    expect(lineOf(en, APPLIED)).toBe(
      "Temple: sage's report added 2 line(s) of scripture, took 1 out and had 1 refused; it filed 3 letter(s). Read them with elvaria scripture list and elvaria memo list.",
    );
    expect(lineOf(vi, APPLIED)).toBe(
      'Đền: tờ trình của sage thêm 2 dòng kinh, gỡ 1 dòng, 1 thao tác bị từ chối; lập 3 thư. Xem bằng elvaria scripture list và elvaria memo list.',
    );
  });

  it('tells a report refused whole, nothing written', () => {
    const refused: Notice = {
      ...APPLIED,
      added: 0,
      retired: 0,
      refused: 8,
      letters: 0,
      rejected: 'replaces_scripture',
    };
    expect(lineOf(en, refused)).toBe(
      "Temple: sage's report was refused whole and nothing was written: its 8 operation(s) would replace a scripture (more than 3 new lines, or more than half of the Monk's lines of one file).",
    );
  });
});
