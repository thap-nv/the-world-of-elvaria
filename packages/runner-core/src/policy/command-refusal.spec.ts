import { describe, expect, it } from 'vitest';

import { commandRefusal } from './command-refusal.ts';
import type { ToolPolicy } from './tool-policy.ts';

const policy = (fields: Partial<ToolPolicy>): ToolPolicy => ({
  tools: ['Bash'],
  allow: [],
  deny: [],
  apprentice: null,
  laws: { forbidden_paths: [], read_only_paths: [], forbidden_commands: [] },
  ...fields,
});

describe('commandRefusal', () => {
  it('refuses every command when the session has no shell', () => {
    expect(commandRefusal(policy({ tools: ['Read'] }), 'ls')).toBe('no shell tool in this session');
  });

  it('reads Claude prefix rules on word boundaries', () => {
    const fenced = policy({ deny: ['Read(./.env)', 'Bash(git push:*)'] });
    expect(commandRefusal(fenced, 'git push')).toBe('denied by rule Bash(git push:*)');
    expect(commandRefusal(fenced, '  git push origin HEAD ')).toBe('denied by rule Bash(git push:*)');
    expect(commandRefusal(fenced, 'git pushx')).toBeUndefined();
  });

  it('reads exact rules and a bare Bash deny', () => {
    expect(commandRefusal(policy({ deny: ['Bash(rm -rf dist)'] }), 'rm -rf dist')).toBe(
      'denied by rule Bash(rm -rf dist)',
    );
    expect(commandRefusal(policy({ deny: ['Bash(rm -rf dist)'] }), 'rm -rf dist/x')).toBeUndefined();
    expect(commandRefusal(policy({ deny: ['Bash'] }), 'ls')).toBe('denied by rule Bash');
  });

  it('applies the laws case-insensitively', () => {
    const lawful = policy({
      laws: {
        forbidden_paths: [],
        read_only_paths: [],
        forbidden_commands: [String.raw`drizzle-kit\s+drop`],
      },
    });
    expect(commandRefusal(lawful, 'pnpm DRIZZLE-KIT  drop')).toBe(
      String.raw`forbidden by law /drizzle-kit\s+drop/`,
    );
    expect(commandRefusal(lawful, 'pnpm test')).toBeUndefined();
  });
});
