import { describe, expect, it } from 'vitest';

import examples from '../../../examples/skill.json' with { type: 'json' };
import { SkillSchema } from './skill.ts';

// A skill the owner wrote by hand, for every territory.
const minimal = {
  version: 1,
  id: 'playwright-axe',
  title: 'Playwright + axe',
  description: 'Use when a quest adds or changes an end-to-end flow that must stay accessible.',
  tags: ['e2e'],
  scope: 'global',
  source: 'user',
  max_tokens: 2000,
  created_at: '2026-12-02T09:00:00+07:00',
};
const monk = { ...minimal, source: 'monk', derived_from: ['L_20261120_a1b2c3'] };

const issuesOf = (value: unknown) => {
  const result = SkillSchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};

describe('SkillSchema', () => {
  it.each(examples)('accepts the example $id of the v1 contract unchanged', (example) => {
    expect(SkillSchema.parse(example)).toEqual(example);
  });

  it.each([
    ['a skill the owner wrote', minimal],
    // Whether the lessons span two characters needs the scripture files: a cross-file check, not this one.
    ['a Monk skill from one lesson', monk],
    ['a territory skill', { ...minimal, scope: 'dc1-se-team' }],
    ['six tags', { ...minimal, tags: ['frontend', 'backend', 'db', 'infra', 'i18n', 'e2e'] }],
    ['the smallest cap', { ...minimal, max_tokens: 100 }],
    ['an update time', { ...minimal, updated_at: '2026-12-03T09:00:00+07:00' }],
  ])('accepts %s', (_, value) => {
    expect(issuesOf(value)).toEqual([]);
  });

  it.each([
    ['an unknown field', { ...minimal, path: 'temple/skills/playwright-axe/SKILL.md' }, ': Unrecognized key'],
    ['a skill attached to a character', { ...minimal, character: 'thorn' }, ': Unrecognized key'],
    ['version 2', { ...minimal, version: 2 }, 'version: '],
    ['a snake_case id', { ...minimal, id: 'playwright_axe' }, 'id: '],
    ['an empty title', { ...minimal, title: '' }, 'title: '],
    ['a title longer than 80', { ...minimal, title: 'x'.repeat(81) }, 'title: '],
    ['an empty description', { ...minimal, description: '' }, 'description: '],
    ['a description longer than 200', { ...minimal, description: 'x'.repeat(201) }, 'description: '],
    [
      'a description on two lines',
      { ...minimal, description: 'Use for e2e.\nAlso for a11y.' },
      'description: a skill description is one line',
    ],
    ['no tag', { ...minimal, tags: [] }, 'tags: '],
    ['seven tags', { ...minimal, tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }, 'tags: '],
    ['a tag twice', { ...minimal, tags: ['e2e', 'e2e'] }, 'tags: items must be unique'],
    ['a kebab-case tag', { ...minimal, tags: ['front-end'] }, 'tags.0: '],
    ['a scope that is not a slug', { ...minimal, scope: 'Global' }, 'scope: '],
    ['an unknown source', { ...minimal, source: 'temple' }, 'source: '],
    [
      'a Monk skill without lessons',
      { ...monk, derived_from: undefined },
      'derived_from: a monk skill needs derived_from',
    ],
    [
      'a Monk skill with no lesson',
      { ...monk, derived_from: [] },
      'derived_from: a monk skill needs derived_from',
    ],
    [
      'a source that is not a lesson id',
      { ...monk, derived_from: ['q_20261120_a1b2c3'] },
      'derived_from.0: ',
    ],
    [
      'a lesson twice',
      { ...monk, derived_from: ['L_20261120_a1b2c3', 'L_20261120_a1b2c3'] },
      'derived_from: items must be unique',
    ],
    ['a missing cap', { ...minimal, max_tokens: undefined }, 'max_tokens: '],
    ['a cap below 100', { ...minimal, max_tokens: 99 }, 'max_tokens: '],
    ['a fractional cap', { ...minimal, max_tokens: 1500.5 }, 'max_tokens: '],
    ['a creation date without time', { ...minimal, created_at: '2026-12-02' }, 'created_at: '],
    ['an update time without offset', { ...minimal, updated_at: '2026-12-03T09:00:00' }, 'updated_at: '],
  ])('rejects %s', (_, value, expected) => {
    const lines = issuesOf(value);
    expect(lines.map((line) => line.slice(0, expected.length))).toContain(expected);
  });
});
