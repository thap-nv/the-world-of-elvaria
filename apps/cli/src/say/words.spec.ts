import { describe, expect, it } from 'vitest';

import { WORDS_MAX, codeWordsOf, namedPathsOf } from './words.ts';

describe('namedPathsOf (PS-21b)', () => {
  it('keeps paths, globs and file names, trimmed of the sentence around them', () => {
    expect(
      namedPathsOf(
        'Sửa `packages/chancellor/src/**` và (docs/api.md), đọc README.md, rồi apps/cli/src/say/ nhé.',
      ),
    ).toEqual(['packages/chancellor/src/**', 'docs/api.md', 'README.md', 'apps/cli/src/say/']);
    expect(namedPathsOf('mọi file *.spec.ts trong `src`')).toEqual(['*.spec.ts']);
  });

  it('leaves out prose, numbers, flags and links', () => {
    expect(namedPathsOf('Kiểm tra link trong docs rồi viết lại phần cài đặt.')).toEqual([]);
    expect(namedPathsOf('graphify 0.9.106 với --no-cluster, xem https://example.com/a.md')).toEqual([]);
    expect(namedPathsOf('')).toEqual([]);
  });

  it('names a path once and at most WORDS_MAX of them', () => {
    expect(namedPathsOf('README.md README.md `README.md`')).toEqual(['README.md']);
    const many = Array.from({ length: WORDS_MAX + 3 }, (_, index) => `f${index}.ts`).join(' ');
    expect(namedPathsOf(many)).toHaveLength(WORDS_MAX);
  });
});

describe('codeWordsOf (PS-21b)', () => {
  it('asks with code names and paths, not with the sentence', () => {
    expect(
      codeWordsOf(
        'Gộp draftQuests() với QUEST_TAGS_MAX, `screen` và kingdom.dispatch trong packages/chancellor',
      ),
    ).toEqual(['screen', 'draftQuests', 'QUEST_TAGS_MAX', 'kingdom.dispatch', 'packages/chancellor']);
    expect(codeWordsOf('AreaCard và FOCUS_MAX, rồi Cần nắm tên')).toEqual(['AreaCard', 'FOCUS_MAX']);
  });

  it('finds no question in words without code', () => {
    expect(codeWordsOf('Viết lại phần cài đặt cho rõ, như Elvaria nói.')).toEqual([]);
  });
});
