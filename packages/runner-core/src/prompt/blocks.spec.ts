// The shell and diff blocks added after the first real quest (P1-11): a character learns which commands its shell
// runs, and a verifier whose prompt carries no diff learns where to read it instead of "no changes".
import { describe, expect, it } from 'vitest';

import { diffBlock, patchBlock, readOnlyBlock, shellBlock } from './blocks.ts';
import { loadPromptTemplates } from './templates.ts';

const templates = await loadPromptTemplates();

describe('shellBlock', () => {
  it('lists the shell rules as commands, one per line, and nothing of the other tools', () => {
    const block = shellBlock(
      {
        tools: ['Read', 'Edit', 'Bash'],
        allow: [
          'Read(./**)',
          'Bash(pnpm check:*)',
          'Bash(git status)',
          'Edit(./**)',
          'Bash(node --test x.mjs:*)',
        ],
      },
      templates,
    );
    expect(block).toContain('# Your shell');
    expect(block).toContain('one command per call');
    expect(block).toContain('- `pnpm check`\n- `git status`\n- `node --test x.mjs`');
    expect(block).not.toMatch(/Read\(|Edit\(|Bash\(/);
  });

  it('is empty for a class without a shell, even when a rule names one', () => {
    expect(shellBlock({ tools: ['Read'], allow: ['Read', 'Bash(pnpm test:*)'] }, templates)).toBe('');
    expect(shellBlock({ tools: ['Bash'], allow: ['Read'] }, templates)).toBe('');
  });
});

describe('readOnlyBlock (P1-24)', () => {
  const laws = {
    forbidden_paths: [],
    read_only_paths: ['docs/glossary.md'],
    patch_paths: [],
    forbidden_commands: [],
  };
  const territory = { commands: { generate: ['pnpm docs:gen', 'pnpm schemas'] } };

  it('lists the read-only paths and the generators the shell may run', () => {
    const policy = { tools: ['Edit', 'Bash'], allow: ['Bash(pnpm docs:gen:*)'], laws };
    const block = readOnlyBlock(policy, territory, templates);
    expect(block).toContain('# Read-only files');
    expect(block).toContain('- `docs/glossary.md`');
    expect(block).toContain('run their generator and commit what it writes');
    // `pnpm schemas` is the territory's, but this session's shell may not run it.
    expect(block).toContain('- `pnpm docs:gen`');
    expect(block).not.toContain('pnpm schemas');
  });

  it('says so when the class cannot run a generator', () => {
    const block = readOnlyBlock(
      { tools: ['Edit'], allow: ['Bash(pnpm docs:gen:*)'], laws },
      territory,
      templates,
    );
    expect(block).toContain('Your class cannot run their generators');
    expect(
      readOnlyBlock({ tools: ['Edit', 'Bash'], allow: [], laws }, { commands: {} }, templates),
    ).toContain('Your class cannot run their generators');
  });

  it('is empty without a write tool or a read-only path', () => {
    expect(readOnlyBlock({ tools: ['Read', 'Bash'], allow: [], laws }, territory, templates)).toBe('');
    const none = { ...laws, read_only_paths: [] };
    expect(readOnlyBlock({ tools: ['Edit'], allow: [], laws: none }, territory, templates)).toBe('');
  });
});

describe('patchBlock (P1-28)', () => {
  const laws = {
    forbidden_paths: [],
    read_only_paths: [],
    patch_paths: ['.husky/**'],
    forbidden_commands: [],
  };

  it('lists the patch paths and names the file the Steward applies', () => {
    const block = patchBlock({ tools: ['Edit'], laws }, templates);
    expect(block).toContain('# Changes through a patch');
    expect(block).toContain('- `.husky/**`');
    expect(block).toContain('Write it as a git patch to `elvaria.patch` at the root of your plot');
    expect(block).toContain('diff --git a/<path> b/<path>');
  });

  it('is empty without a write tool or a patch path', () => {
    expect(patchBlock({ tools: ['Read', 'Bash'], laws }, templates)).toBe('');
    expect(patchBlock({ tools: ['Edit'], laws: { ...laws, patch_paths: [] } }, templates)).toBe('');
  });
});

describe('diffBlock', () => {
  const git = (remote?: string) => ({
    vcs: {
      type: 'git' as const,
      default_branch: 'main',
      ...(remote === undefined ? {} : { remote }),
    },
  });

  it('fences a diff it is given, and says so when the branch has none', () => {
    expect(diffBlock('+a\n', git())).toBe('```diff\n+a\n```');
    expect(diffBlock('  \n', git())).toBe('The branch has no changes.');
  });

  it('sends the verifier to the plot when the prompt carries none, against the ref the branch forked from', () => {
    expect(diffBlock(null, git('https://github.com/o/r.git'))).toContain('`git diff origin/main...HEAD`');
    expect(diffBlock(null, git())).toContain('`git diff main...HEAD`');
    expect(diffBlock(null, { vcs: { type: 'none' } })).toContain('a folder without git');
  });
});
