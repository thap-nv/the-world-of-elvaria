// ToolPolicy → agy prefix rules (spike P1-12a §3): each class of the Gemini tribe, a judge, and the fences.
import { describe, expect, it } from 'vitest';

import { toolPolicyOf } from '@elvaria/runner-core';
import type { ToolPolicyInput } from '@elvaria/runner-core';

import { ANTIGRAVITY_CAPABILITIES } from './runner.ts';
import { agySettingsOf, prefixOf } from './settings.ts';

const DC1 = {
  laws: {
    forbidden_paths: ['infra/secrets/**', '**/*.pem'],
    forbidden_commands: ['drizzle-kit\\s+push'],
    patch_paths: ['.husky/**'],
    read_before_write: [],
    rank_floor: [],
  },
  checks: [{ id: 'unit', run: 'pnpm test', when: [], exclusive: false }],
  commands: { lint: 'pnpm lint' },
  vcs: { type: 'git', default_branch: 'main' },
} as unknown as NonNullable<ToolPolicyInput['territory']>;

const settingsOf = (role: ToolPolicyInput['role'], allow: string[], deny: string[]) =>
  agySettingsOf(toolPolicyOf({ role, characterClass: { tools: { allow, deny } }, territory: DC1 }))
    .permissions;

const FENCES = [
  'command(git push)',
  'read_file(.env)',
  'read_file(.env.)',
  'read_file(infra/secrets/)',
  'write_file(.env)',
  'write_file(.env.)',
  'write_file(infra/secrets/)',
  'write_file(.git/)',
  'write_file(.agents/)',
  'write_file(GEMINI.md)',
];

describe("agySettingsOf: git's own folder (P1-49)", () => {
  it('denies writing in .git/ to every role, as a folder: .gitignore and .github/ stay writable', () => {
    for (const role of ['assignee', 'verifier', 'chancellor'] as const) {
      const { deny } = settingsOf(role, ['Read', 'Edit', 'Write'], []);
      expect(deny).toContain('write_file(.git/)');
      // agy rules are prefixes: `write_file(.git)` would deny `.gitignore`; the hook guards a worktree's `.git` file.
      expect(deny).not.toContain('write_file(.git)');
      expect(deny).not.toContain('read_file(.git/)');
    }
  });
});

describe('agySettingsOf: generated files (P1-24)', () => {
  it('lets a writer run the generators and read generated files, and denies writing them', () => {
    const territory = {
      ...DC1,
      laws: { ...DC1.laws, read_only_paths: ['docs/glossary.md', 'docs/schemas/**'] },
      commands: { generate: ['pnpm docs:gen'] },
    };
    const characterClass = { tools: { allow: ['Read', 'Edit', 'Bash(git status:*)'], deny: [] } };
    const { permissions } = agySettingsOf(toolPolicyOf({ role: 'assignee', characterClass, territory }));
    expect(permissions.allow).toContain('command(pnpm docs:gen)');
    expect(permissions.deny).toEqual(
      expect.arrayContaining(['write_file(docs/glossary.md)', 'write_file(docs/schemas/)']),
    );
    expect(permissions.deny.filter((rule) => rule.startsWith('read_file(docs'))).toEqual([]);
    // Patch paths (P1-28) are the hook's and the Steward's: no settings rule names them.
    expect([...permissions.allow, ...permissions.deny].filter((rule) => rule.includes('.husky'))).toEqual([]);
  });
});

describe('agySettingsOf', () => {
  it("gives a scribe the plot to write in and nothing to run but the territory's checks", () => {
    const scribe = settingsOf(
      'assignee',
      ['Read', 'Edit', 'Write', 'Glob', 'Grep'],
      ['WebFetch', 'Bash(git push:*)'],
    );
    expect(scribe).toEqual({ allow: ['write_file(./)'], deny: FENCES, ask: [] });
  });

  it('lets a scout read the web, every page by its scheme', () => {
    const scout = settingsOf('assignee', ['Read', 'Write', 'WebFetch', 'WebSearch'], ['Bash(git push:*)']);
    expect(scout.allow).toEqual(['write_file(./)', 'read_url(https://)', 'read_url(http://)']);
  });

  it('gives a judge its commands and no write at all', () => {
    const judge = settingsOf(
      'verifier',
      ['Read', 'Glob', 'Grep', 'Bash(pnpm test:*)', 'Bash(git diff:*)'],
      ['Edit', 'Write', 'Agent'],
    );
    expect(judge.allow).toEqual(['command(pnpm test)', 'command(git diff)', 'command(pnpm lint)']);
    expect(judge.allow.some((rule) => rule.startsWith('write_file'))).toBe(false);
  });

  it('turns path rules into prefixes and leaves a mid-path wildcard to the hook', () => {
    const own = settingsOf(
      'assignee',
      ['Edit(./docs/**)', 'Write(src/*.ts)', 'Bash(node:*)', 'Bash'],
      ['Bash(rm -rf:*)'],
    );
    // A shell brings the territory's checks along (ADR 0008).
    expect(own.allow).toEqual([
      'write_file(docs/)',
      'command(node)',
      'command(pnpm test)',
      'command(pnpm lint)',
    ]);
    expect(own.deny[0]).toBe('command(rm -rf)');
    // **/*.pem has no prefix form: the hook's laws guard it (policy.json).
    expect(own.deny.some((rule) => rule.includes('pem'))).toBe(false);
  });

  it('grants nothing for a tool the class lacks', () => {
    expect(settingsOf('assignee', ['Read', 'Bash(pnpm test:*)'], ['Bash']).allow).toEqual([]);
  });

  it("opens the assignee's handover letter in the kingdom, outside the plot, and nothing else there", () => {
    const policy = toolPolicyOf({
      role: 'assignee',
      characterClass: { tools: { allow: ['Read'], deny: [] } },
    });
    const letter = 'D:\\Elvaria kingdom\\quests\\q_20261107_a9yb2k\\handover.md';
    expect(agySettingsOf(policy, letter).permissions.allow).toEqual([
      'read_file(D:/Elvaria kingdom/quests/q_20261107_a9yb2k/handover.md)',
      'write_file(D:/Elvaria kingdom/quests/q_20261107_a9yb2k/handover.md)',
    ]);
  });
});

describe('agySettingsOf: search for a CLI without a search tool (P1-53)', () => {
  const GIT: typeof DC1 = { ...DC1, vcs: { type: 'git', default_branch: 'main' } };
  const allowOf = (role: ToolPolicyInput['role'], allow: string[], deny: string[] = []) =>
    agySettingsOf(
      toolPolicyOf({ role, characterClass: { tools: { allow, deny } }, territory: GIT, cli_search: false }),
    ).permissions.allow;
  const SEARCH = ['command(git grep)', 'command(git ls-files)'];

  it('gives a class with Glob or Grep git grep and git ls-files, with no shell of its own', () => {
    expect(allowOf('assignee', ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebSearch'])).toEqual([
      'write_file(./)',
      ...SEARCH,
    ]);
    expect(allowOf('assignee', ['Read', 'Grep'])).toEqual(SEARCH);
    expect(allowOf('assignee', ['Read', 'Glob'], ['Bash'])).toEqual(SEARCH);
  });

  it("lists them after a judge's own commands", () => {
    expect(allowOf('verifier', ['Read', 'Glob', 'Grep', 'Bash(git diff:*)'])).toEqual([
      'command(git diff)',
      'command(pnpm test)',
      'command(pnpm lint)',
      ...SEARCH,
    ]);
  });

  it('gives none to a class without Glob and Grep, nor where the policy has no search commands', () => {
    expect(allowOf('assignee', ['Read', 'Edit'])).toEqual(['write_file(./)']);
    const own = settingsOf('assignee', ['Read', 'Glob', 'Grep'], []);
    expect(own.allow.filter((rule) => rule.includes('git '))).toEqual([]);
  });

  it('declares the search the adapter lacks, so the Steward asks for these commands', () => {
    expect(ANTIGRAVITY_CAPABILITIES.search).toBe(false);
  });
});

describe('prefixOf', () => {
  it.each([
    ['./infra/secrets/**', 'infra/secrets/'],
    ['infra\\secrets\\**\\*', 'infra/secrets/'],
    ['./.env.*', '.env.'],
    ['./.env', '.env'],
    ['**', './'],
    ['./**', './'],
    ['**/*.pem', undefined],
    ['src/*/x.ts', undefined],
  ])('%s → %s', (glob, prefix) => {
    expect(prefixOf(glob)).toBe(prefix);
  });
});
