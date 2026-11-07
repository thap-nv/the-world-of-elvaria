// The shell and diff blocks added after the first real quest (P1-11): a character learns which commands its shell
// runs, and a verifier whose prompt carries no diff learns where to read it instead of "no changes".
import { describe, expect, it } from 'vitest';

import { diffBlock, shellBlock } from './blocks.ts';
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
