// The rules of hot files (PS-09, K3): a three-way join line by line inside each conflict, never a plain union.
import { describe, expect, it } from 'vitest';

import { joinHunk, resolveShared, ruleOf, unionOf } from './shared-merge.ts';

const SHARED = [
  { glob: 'docs/schemas/**', merge: 'regenerate' as const },
  { glob: 'docs/plan.md', merge: 'union' as const },
  { glob: 'locales/*.json', merge: 'union' as const },
];

/** A file git wrote with diff3 markers: `before`, one conflict of three sides, `after`. */
const conflicted = (ours: string[], base: string[], theirs: string[], eol = '\n'): string =>
  [
    'head',
    '<<<<<<< HEAD',
    ...ours,
    '||||||| 1a2b3c4',
    ...base,
    '=======',
    ...theirs,
    '>>>>>>> 5d6e7f8',
    'tail',
    '',
  ].join(eol);

describe('ruleOf', () => {
  it('names the rule of the first glob that matches, none for a file that is not hot', () => {
    expect(ruleOf('docs/schemas/quest.schema.json', SHARED)).toBe('regenerate');
    expect(ruleOf('docs/plan.md', SHARED)).toBe('union');
    expect(ruleOf('src/a.ts', SHARED)).toBeUndefined();
  });
});

describe('joinHunk', () => {
  it('takes, line by line, the side that changed it', () => {
    const hunk = {
      ours: ['| 1 | done |', '| 2 | todo |'],
      base: ['| 1 | todo |', '| 2 | todo |'],
      theirs: ['| 1 | todo |', '| 2 | done |'],
    };
    expect(joinHunk(hunk)).toEqual(['| 1 | done |', '| 2 | done |']);
  });

  it('keeps one copy of a line both sides changed alike', () => {
    expect(joinHunk({ ours: ['x', 'b'], base: ['a', 'b'], theirs: ['x', 'c'] })).toEqual(['x', 'c']);
  });

  it('is a real conflict when one line changed two ways, or the sides changed how many lines there are', () => {
    expect(joinHunk({ ours: ['x'], base: ['a'], theirs: ['y'] })).toBeUndefined();
    expect(joinHunk({ ours: ['x', 'y'], base: ['a'], theirs: ['a'] })).toBeUndefined();
  });

  it("keeps the incoming branch's added lines first, then the plot's, when both only added", () => {
    expect(joinHunk({ ours: ['quest row'], base: [], theirs: ['main row'] })).toEqual([
      'main row',
      'quest row',
    ]);
  });
});

describe('unionOf', () => {
  it('joins each conflict and keeps the lines around it', () => {
    expect(unionOf(conflicted(['a1', 'b'], ['a', 'b'], ['a', 'b2']), 'x\n')).toBe('head\na1\nb2\ntail\n');
  });

  it("ends every line as the plot's side ends them", () => {
    const merged = conflicted(['a1'], [], ['a2']);
    expect(unionOf(merged, 'one\r\ntwo\r\n')).toBe('head\r\na2\r\na1\r\ntail\r\n');
    expect(unionOf(conflicted(['a1'], [], ['a2'], '\r\n'), 'one\n')).toBe('head\na2\na1\ntail\n');
  });

  it('keeps a file without a last line ending so', () => {
    expect(unionOf(conflicted(['a1'], [], ['a2']).slice(0, -1), '')).toBe('head\na2\na1\ntail');
  });

  it('gives up on a real conflict, a conflict git did not close, a merge without diff3, and no conflict at all', () => {
    expect(unionOf(conflicted(['x'], ['a'], ['y']), '')).toBeUndefined();
    expect(unionOf('<<<<<<< HEAD\na\n||||||| base\nb\n', '')).toBeUndefined();
    expect(unionOf('<<<<<<< HEAD\na\n=======\nb\n>>>>>>> main\n', '')).toBeUndefined();
    expect(unionOf('plain\n', '')).toBeUndefined();
  });

  it('reads a marker only at its full size', () => {
    const text = conflicted(['<<<<<<<< not a marker'], [], ['=======x']);
    expect(unionOf(text, '')).toBe('head\n=======x\n<<<<<<<< not a marker\ntail\n');
  });
});

describe('resolveShared', () => {
  it('keeps the plot side of a regenerated file, joins a union file, and leaves any other file a conflict', () => {
    const files = [
      { path: 'docs/schemas/quest.schema.json', merged: null, ours: null },
      { path: 'docs/plan.md', merged: conflicted(['a1'], ['a'], ['a']), ours: 'x\n' },
      { path: 'src/a.ts', merged: conflicted(['a1'], ['a'], ['a2']), ours: 'x\n' },
    ];
    expect(resolveShared(files, SHARED)).toEqual([
      { path: 'docs/schemas/quest.schema.json', outcome: 'resolved', rule: 'regenerate' },
      { path: 'docs/plan.md', outcome: 'resolved', rule: 'union', content: 'head\na1\ntail\n' },
      { path: 'src/a.ts', outcome: 'conflict' },
    ]);
  });

  it('leaves a union file a conflict when a side deleted it, git wrote no text, or the JSON does not parse', () => {
    const json = [
      '{',
      '<<<<<<< HEAD',
      '  "a": 1',
      '||||||| base',
      '=======',
      '  "b": 2',
      '>>>>>>> main',
      '}',
      '',
    ];
    const files = [
      { path: 'docs/plan.md', merged: conflicted(['a1'], ['a'], ['a']), ours: null },
      { path: 'docs/plan.md', merged: null, ours: 'x\n' },
      { path: 'locales/en.json', merged: json.join('\n'), ours: '{}\n' },
    ];
    expect(resolveShared(files, SHARED).map(({ outcome }) => outcome)).toEqual([
      'conflict',
      'conflict',
      'conflict',
    ]);
  });

  it('joins a JSON file that still parses', () => {
    const json = [
      '{',
      '<<<<<<< HEAD',
      '  "a": 1,',
      '||||||| base',
      '=======',
      '  "b": 2,',
      '>>>>>>> main',
      '  "z": 0',
      '}',
      '',
    ];
    const [file] = resolveShared(
      [{ path: 'locales/vi.json', merged: json.join('\n'), ours: '{}\n' }],
      SHARED,
    );
    expect(file).toMatchObject({ outcome: 'resolved', rule: 'union' });
    expect(JSON.parse(file !== undefined && 'content' in file ? file.content : '')).toEqual({
      a: 1,
      b: 2,
      z: 0,
    });
  });
});
