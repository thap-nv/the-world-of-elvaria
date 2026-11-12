import { describe, expect, it } from 'vitest';

import kindExamples from '../../../examples/memo-kind.json' with { type: 'json' };
import examples from '../../../examples/memo.json' with { type: 'json' };
import { MemosFileSchema } from './memo-kind.ts';
import { MemoSchema } from './memo.ts';

const [open, closed] = examples;

const issuesOf = (value: unknown) => {
  const result = MemoSchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};

describe('MemoSchema', () => {
  it.each(examples)('accepts the example $id of the v1 contract unchanged', (example) => {
    expect(MemoSchema.parse(example)).toEqual(example);
  });

  it.each([
    ['a closed memo without outcome', { ...closed, outcome: undefined }, 'outcome: a memo has an outcome'],
    ['an open memo with an outcome', { ...open, outcome: closed?.outcome }, 'outcome: a memo has an outcome'],
    [
      'a handled memo without its quest',
      { ...closed, outcome: { decision: 'handled', at: closed?.outcome?.at } },
      'outcome.quest: a handled memo names its quest',
    ],
    ['an id of another shape', { ...open, id: 'm_2026_abc' }, 'id: Invalid string'],
    ['an unknown route', { ...open, to: { route: 'owner' } }, 'to.route: Invalid input'],
    ['an empty text', { ...open, body: '' }, 'body: Too small'],
    ['a text past its limit', { ...open, body: 'x'.repeat(2001) }, 'body: Too big'],
    [
      'too many refs',
      { ...open, refs: Array.from({ length: 21 }, (_, n) => `src/${n}.ts`) },
      'refs: Too big',
    ],
    ['a run 0', { ...open, attempt: 0 }, 'attempt: Too small'],
  ])('rejects %s', (_, value, expected) => {
    expect(issuesOf(value).join('\n')).toContain(expected);
  });

  it('takes a shelved or rejected memo without a quest', () => {
    const at = '2026-11-12T15:00:00+07:00';
    expect(issuesOf({ ...open, state: 'closed', outcome: { decision: 'shelved', at } })).toEqual([]);
    expect(issuesOf({ ...open, state: 'closed', outcome: { decision: 'rejected', at, note: 'no' } })).toEqual(
      [],
    );
  });
});

describe('MemosFileSchema', () => {
  it('accepts the example of the v1 contract unchanged', () => {
    expect(MemosFileSchema.parse(kindExamples[0])).toEqual(kindExamples[0]);
  });

  it('needs at least one kind, each with a known route', () => {
    expect(MemosFileSchema.safeParse({ version: 1, memos: [] }).success).toBe(false);
    const kind = { ...kindExamples[0]!.memos[0], route: 'everyone' };
    expect(MemosFileSchema.safeParse({ version: 1, memos: [kind] }).success).toBe(false);
  });
});
