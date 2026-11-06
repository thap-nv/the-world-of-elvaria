import { describe, expect, it } from 'vitest';

import examples from '../../examples/territory.json' with { type: 'json' };
import { TerritorySchema } from './territory.ts';

const [example] = examples;

const minimal = {
  version: 1,
  id: 'dc1-se-team',
  name: 'dc1-se-team',
  path: 'D:/Dummy/Tool - DC1/dc1-se-team',
  kind: 'code',
  vcs: { type: 'git', default_branch: 'main' },
};

const issuesOf = (value: unknown) => {
  const result = TerritorySchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};

describe('TerritorySchema', () => {
  it('accepts the example of the v1 contract and keeps every value of it', () => {
    // The example leaves `exclusive` out of most checks; parsing adds the default `false`.
    expect(TerritorySchema.parse(example)).toMatchObject(example!);
  });

  it('fills the contract defaults from a minimal file', () => {
    expect(TerritorySchema.parse(minimal)).toEqual({
      ...minimal,
      worktree_dir: '.elvaria/worktrees',
      max_concurrent: 1,
      context_files: ['CLAUDE.md', 'README.md', '.claude/rules/*.md'],
      commands: {},
      checks: [],
      laws: { forbidden_paths: [], forbidden_commands: [], read_before_write: [], rank_floor: [] },
      secrets_allowed: [],
      buildings: [],
      health: { ci: 'unknown', open_bugs: 0 },
    });
  });

  it('gives every territory its own default lists', () => {
    const first = TerritorySchema.parse(minimal);
    first.context_files.push('extra.md');
    expect(TerritorySchema.parse(minimal).context_files).toHaveLength(3);
  });

  it('accepts a folder without version control and no default branch', () => {
    expect(issuesOf({ ...minimal, vcs: { type: 'none' } })).toEqual([]);
  });

  it.each([
    [
      'a git territory without default branch',
      { vcs: { type: 'git' } },
      'vcs.default_branch: a git territory',
    ],
    [
      'two checks with one id',
      { checks: [check('lint'), check('lint')] },
      'checks.1.id: duplicate id "lint"',
    ],
    [
      'a law that is not a regex',
      { laws: { forbidden_commands: ['git (push'] } },
      'not a valid regular expression',
    ],
    ['a secret allowed twice', { secrets_allowed: ['npm_token', 'npm_token'] }, 'items must be unique'],
    ['a backslash in worktree_dir', { worktree_dir: '..\\worktrees' }, 'worktree_dir'],
    [
      'a rank floor with an unknown rank',
      { laws: { rank_floor: [{ glob: 'x', min_rank: 'Z' }] } },
      'min_rank',
    ],
    ['an unknown territory kind', { kind: 'library' }, 'kind'],
  ])('rejects %s', (_, change, expected) => {
    expect(issuesOf({ ...minimal, ...change }).join('\n')).toContain(expected);
  });
});

function check(id: string) {
  return { id, run: 'pnpm lint', when: ['**/*.ts'], timeout_minutes: 10 };
}
