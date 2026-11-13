import { describe, expect, it } from 'vitest';

import examples from '../../examples/territory.json' with { type: 'json' };
import { TERRITORY_DEFAULTS } from '../constants.ts';
import { commandLinesOf } from './territory-checks.ts';
import { TerritorySchema, namesNoGitFolder } from './territory.ts';

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
      // Docker's own lines (P1-54): a territory without them would read a stopped Docker as failing work.
      environment_errors: [...TERRITORY_DEFAULTS.environment_errors],
      laws: {
        forbidden_paths: [],
        read_only_paths: [],
        patch_paths: [],
        forbidden_commands: [],
        read_before_write: [],
        rank_floor: [],
      },
      // The blind trial doubles a party's cost, so it is off until the owner turns it on (§3.15, P1-21).
      blind_trial: { enabled: false, min_rank: 'B' },
      secrets_allowed: [],
      buildings: [],
      health: { ci: 'unknown', open_bugs: 0 },
    });
  });

  it('keeps protected paths as written, and writes none for a territory that names none (PS-04)', () => {
    const laws = { protected_paths: ['.claude/**', 'CLAUDE.md'] };
    expect(TerritorySchema.parse({ ...minimal, laws }).laws.protected_paths).toEqual(laws.protected_paths);
    // No default: a file `territory add` writes stays readable by a build pinned before PS-04 (a rollback).
    expect('protected_paths' in TerritorySchema.parse(minimal).laws).toBe(false);
  });

  it('takes its own environment errors, and refuses one that is no regular expression', () => {
    const own = TerritorySchema.parse({
      ...minimal,
      environment_errors: ['connect ECONNREFUSED [^ ]+:5432'],
    });
    expect(own.environment_errors).toEqual(['connect ECONNREFUSED [^ ]+:5432']);
    expect(TerritorySchema.parse({ ...minimal, environment_errors: [] }).environment_errors).toEqual([]);
    expect(issuesOf({ ...minimal, environment_errors: ['(unclosed'] })).toEqual([
      'environment_errors.0: not a valid regular expression',
    ]);
  });

  // P1-54, (f) of the P1-50 report.
  it('takes a check that may flake, its spec files and the command for them alone', () => {
    const check = { id: 'e2e', run: 'pnpm e2e', when: ['apps/web/**'], timeout_minutes: 60 };
    const flake = { specs: ['apps/web/e2e/**/*.spec.ts'], run: 'pnpm exec playwright test {specs}' };
    const parsed = TerritorySchema.parse({ ...minimal, checks: [{ ...check, flake }] });
    expect(parsed.checks[0]?.flake).toEqual(flake);
    // A bare flake reruns the whole check.
    const bare = TerritorySchema.parse({ ...minimal, checks: [{ ...check, flake: {} }] });
    expect(bare.checks[0]?.flake).toEqual({ specs: [] });
    const refused = 'checks.0.flake.run: flake.run names {specs} and comes with flake.specs';
    expect(issuesOf({ ...minimal, checks: [{ ...check, flake: { ...flake, run: 'pnpm e2e' } }] })).toEqual([
      refused,
    ]);
    expect(issuesOf({ ...minimal, checks: [{ ...check, flake: { run: flake.run } }] })).toEqual([refused]);
  });

  it('takes a blind trial turned on, its rank defaulting to B, and refuses a rank it does not know', () => {
    const on = TerritorySchema.parse({ ...minimal, blind_trial: { enabled: true } });
    expect(on.blind_trial).toEqual({ enabled: true, min_rank: 'B' });
    expect(issuesOf({ ...minimal, blind_trial: { enabled: true, min_rank: 'Z' } })).toEqual([
      expect.stringContaining('blind_trial.min_rank'),
    ]);
  });

  it('takes hot files with how a merge joins them, a regenerated one only with a generate command (PS-05)', () => {
    const shared = [
      { glob: 'packages/i18n/src/glossary.json', merge: 'union' },
      { glob: 'docs/schemas/**', merge: 'regenerate' },
    ];
    expect(issuesOf({ ...minimal, shared_paths: shared })).toEqual([
      'shared_paths: a shared path merged by regenerate needs commands.generate',
    ]);
    const generated = { ...minimal, commands: { generate: ['pnpm schemas'] }, shared_paths: shared };
    expect(TerritorySchema.parse(generated).shared_paths).toEqual(shared);
    expect(issuesOf({ ...minimal, shared_paths: [shared[0]] })).toEqual([]);
    expect(issuesOf({ ...minimal, shared_paths: [{ glob: 'a', merge: 'ours' }] })).toHaveLength(1);
    expect(TerritorySchema.parse(minimal)).not.toHaveProperty('shared_paths');
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
    ['an empty generator command', { commands: { generate: [''] } }, 'commands.generate.0'],
    ['a check with no command', { checks: [{ ...check('lint'), run: [] }] }, 'checks.0.run'],
    ['an empty reset command', { commands: { reset: ['pnpm db:reset', ''] } }, 'commands.reset'],
    ['an empty read-only glob', { laws: { read_only_paths: [''] } }, 'laws.read_only_paths.0'],
    ['an empty protected glob', { laws: { protected_paths: [''] } }, 'laws.protected_paths.0'],
    ['a patch glob into git', { laws: { patch_paths: ['.git/**'] } }, 'laws.patch_paths.0: a patch never'],
  ])('rejects %s', (_, change, expected) => {
    expect(issuesOf({ ...minimal, ...change }).join('\n')).toContain(expected);
  });

  it('takes a check, a reset and a coverage command as one command or a list run in order (P1-20)', () => {
    const drift = { ...check('openapi'), run: ['pnpm api:openapi', 'git diff --exit-code'] };
    const commands = { reset: 'pnpm db:reset', coverage: ['pnpm test --coverage'] };
    expect(issuesOf({ ...minimal, checks: [drift], commands })).toEqual([]);
    expect(commandLinesOf(drift.run)).toEqual(['pnpm api:openapi', 'git diff --exit-code']);
    expect(commandLinesOf('pnpm lint')).toEqual(['pnpm lint']);
  });

  it('lets a patch reach the folders a CLI guards, never git under any spelling (P1-28)', () => {
    expect(
      issuesOf({ ...minimal, laws: { patch_paths: ['.husky/**', '.claude/rules/*.md', '.gitmodules'] } }),
    ).toEqual([]);
    for (const glob of ['.git/**', 'sub\\.GIT\\hooks\\*', 'a/.git./config', 'GIT~1/hooks/**', '.git ']) {
      expect(namesNoGitFolder(glob)).toBe(false);
    }
    expect(namesNoGitFolder('.github/workflows/*.yml')).toBe(true);
  });
});

function check(id: string) {
  return { id, run: 'pnpm lint', when: ['**/*.ts'], timeout_minutes: 10 };
}
