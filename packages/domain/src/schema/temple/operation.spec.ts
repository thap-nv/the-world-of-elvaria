import { describe, expect, it } from 'vitest';

import { TempleLetterSchema, TempleReportPayloadSchema } from './operation.ts';

const letter = {
  rung: 'check',
  to: 'chancellor',
  source_verdict: 'q_20261118_7k3m2a-2',
  body: 'A check would catch it.',
  refs: [],
};
const add = { op: 'add', owner: 'temple', text: 'Run the checks.' };

const issuesOf = (payload: object) => {
  const result = TempleReportPayloadSchema.safeParse({
    character: 'sage',
    operations: [],
    letters: [],
    ...payload,
  });
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};

describe('TempleReportPayloadSchema', () => {
  it('takes an add without a fail kind or a verdict: the Steward refuses it by name', () => {
    expect(issuesOf({ operations: [add] })).toEqual([]);
  });

  it('refuses a report of nothing, and an operation that replaces a file', () => {
    expect(issuesOf({})).toEqual(['operations: a temple report changes a line or carries a letter']);
    expect(issuesOf({ operations: [{ op: 'replace', owner: 'temple', text: 'All new.' }] })).toHaveLength(1);
  });

  it('refuses a merge of one line', () => {
    const merge = { ...add, op: 'merge', lessons: ['L_20261118_4k2pqz'] };
    expect(issuesOf({ operations: [merge] })).toEqual([
      'operations.0.lessons: Too small: expected array to have >=2 items',
    ]);
  });

  it('refuses a seventh letter', () => {
    expect(issuesOf({ letters: Array.from({ length: 7 }, () => letter) })).toEqual([
      'letters: Too big: expected array to have <=6 items',
    ]);
  });
});

describe('TempleLetterSchema', () => {
  it.each([
    ['prevent', 'chancellor', true],
    ['script', 'chancellor', true],
    ['model', 'owner', true],
    ['model', 'chancellor', false],
    ['check', 'owner', false],
  ])('a %s letter to the %s: %s', (rung, to, valid) => {
    expect(TempleLetterSchema.safeParse({ ...letter, rung, to }).success).toBe(valid);
  });
});
