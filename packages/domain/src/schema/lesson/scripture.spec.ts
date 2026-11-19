import { describe, expect, it } from 'vitest';

import examples from '../../../examples/scripture.json' with { type: 'json' };
import { ScriptureLedgerSchema } from './scripture.ts';

const entry = {
  id: 'L_20261118_4k2pqz',
  source: 'monk',
  source_verdict: 'q_20261118_7k3m2a-2',
  added_at: '2026-11-18T21:04:10+07:00',
};

const issuesOf = (lessons: readonly object[]) => {
  const result = ScriptureLedgerSchema.safeParse({ version: 1, lessons });
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};

describe('ScriptureLedgerSchema', () => {
  it.each(examples)('accepts the example of the v1 contract unchanged', (example) => {
    expect(ScriptureLedgerSchema.parse(example)).toEqual(example);
  });

  it("refuses a Monk's lesson without its verdict, and one from outside without its origin", () => {
    const { source_verdict: _, ...bare } = entry;
    expect(issuesOf([bare])).toEqual(['lessons.0.source_verdict: a monk lesson needs source_verdict']);
    expect(issuesOf([{ ...bare, source: 'outside' }])).toEqual([
      'lessons.0.origin: a lesson from outside needs origin',
    ]);
  });

  it('refuses an id twice, and a merge of fewer than two lines', () => {
    expect(issuesOf([entry, entry])).toEqual(['lessons.1.id: duplicate id "L_20261118_4k2pqz"']);
    expect(issuesOf([{ ...entry, merged_from: ['L_20261117_a1b2c3'] }])).toHaveLength(1);
  });

  it('refuses a retirement without the sentence it took out', () => {
    const retired = { at: '2026-11-19T21:10:02+07:00', by: 'monk' };
    expect(issuesOf([{ ...entry, retired }])).toEqual([
      'lessons.0.retired.text: Invalid input: expected string, received undefined',
    ]);
  });
});
