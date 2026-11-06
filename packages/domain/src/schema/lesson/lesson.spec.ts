import { describe, expect, it } from 'vitest';

import examples from '../../../examples/lesson.json' with { type: 'json' };
import { LessonSchema } from './lesson.ts';

// A line the owner wrote by hand: the parser gave it an id and source = user, and it needs no verdict.
const minimal = {
  version: 1,
  id: 'L_20261107_x4y5z6',
  owner: 'temple',
  text: 'Never read .env or infra/secrets; ask for the secret by name.',
  source: 'user',
  created_at: '2026-11-07',
};
const monk = {
  ...minimal,
  owner: 'thorn',
  source: 'monk',
  source_verdict: 'q_20261106_7k3m2a-2',
};

const issuesOf = (value: unknown) => {
  const result = LessonSchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};

describe('LessonSchema', () => {
  it.each(examples)('accepts the example $id of the v1 contract unchanged', (example) => {
    expect(LessonSchema.parse(example)).toEqual(example);
  });

  it.each([
    ['a line the owner added', minimal],
    ['a lesson of the Monk', monk],
    ['a retired lesson', { ...monk, last_hit_at: '2026-11-08', retired_at: '2027-02-08' }],
    ['a text of 300 characters', { ...minimal, text: 'x'.repeat(300) }],
  ])('accepts %s', (_, value) => {
    expect(issuesOf(value)).toEqual([]);
  });

  it.each([
    ['an unknown field', { ...minimal, hits: 3 }, ': Unrecognized key'],
    ['version 2', { ...minimal, version: 2 }, 'version: '],
    ['a quest id as lesson id', { ...minimal, id: 'q_20261107_x4y5z6' }, 'id: '],
    ['an id with a letter Crockford leaves out', { ...minimal, id: 'L_20261107_x4y5zo' }, 'id: '],
    ['an owner that is not a slug', { ...minimal, owner: 'Temple' }, 'owner: '],
    ['an empty text', { ...minimal, text: '' }, 'text: '],
    ['a text of 301 characters', { ...minimal, text: 'x'.repeat(301) }, 'text: '],
    ['a text on two lines', { ...minimal, text: 'Run lint.\nThen test.' }, 'text: a lesson is one line'],
    ['a text with a carriage return', { ...minimal, text: 'Run lint.\r' }, 'text: a lesson is one line'],
    ['an unknown source', { ...minimal, source: 'temple' }, 'source: '],
    [
      'a Monk lesson without its verdict',
      { ...monk, source_verdict: undefined },
      'source_verdict: a monk lesson needs source_verdict',
    ],
    ['a verdict id without attempt', { ...monk, source_verdict: 'q_20261106_7k3m2a' }, 'source_verdict: '],
    [
      'a created_at that is a date-time',
      { ...minimal, created_at: '2026-11-07T08:00:00+07:00' },
      'created_at: ',
    ],
    [
      'a created_at that is not the date in the id',
      { ...minimal, created_at: '2026-11-08' },
      'created_at: created_at must be the date in the id',
    ],
    ['a hit date that is not a calendar day', { ...minimal, last_hit_at: '2026-13-01' }, 'last_hit_at: '],
    [
      'a retired date that is a date-time',
      { ...minimal, retired_at: '2027-02-08T00:00:00Z' },
      'retired_at: ',
    ],
  ])('rejects %s', (_, value, expected) => {
    const lines = issuesOf(value);
    expect(lines.map((line) => line.slice(0, expected.length))).toContain(expected);
  });
});
