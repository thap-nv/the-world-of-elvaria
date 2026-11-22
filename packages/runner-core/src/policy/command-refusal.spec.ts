import { describe, expect, it } from 'vitest';

import { commandRefusal } from './command-refusal.ts';
import { toolPolicyOf } from './tool-policy.ts';
import type { ToolPolicy } from './tool-policy.ts';

const policy = (fields: Partial<ToolPolicy>): ToolPolicy => ({
  tools: ['Bash'],
  allow: [],
  deny: [],
  apprentice: null,
  laws: { forbidden_paths: [], read_only_paths: [], patch_paths: [], forbidden_commands: [] },
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
        patch_paths: [],
        forbidden_commands: [String.raw`drizzle-kit\s+drop`],
      },
    });
    expect(commandRefusal(lawful, 'pnpm DRIZZLE-KIT  drop')).toBe(
      String.raw`forbidden by law /drizzle-kit\s+drop/`,
    );
    expect(commandRefusal(lawful, 'pnpm test')).toBeUndefined();
  });

  // SEC-01: every session's policy, whatever its class, refuses git's credential helper and the places that hold secrets.
  const knight = toolPolicyOf({
    role: 'assignee',
    characterClass: { tools: { allow: ['Read', 'Bash(git status:*)', 'Bash(git config:*)'], deny: [] } },
  });

  it.each([
    'git credential fill',
    'git -c credential.interactive=never credential fill',
    'git credential-manager get',
    String.raw`C:\Git\mingw64\bin\git-credential-manager.exe get`,
    'GIT credential approve',
  ])('refuses git credential helpers: %s', (command) => {
    expect(commandRefusal(knight, command)).toMatch(
      /^(?:denied by rule Bash\(git credential:\*\)|forbidden by law)/,
    );
  });

  it('lets git name its credential settings', () => {
    expect(commandRefusal(knight, 'git config --get-all credential.helper')).toBeUndefined();
  });

  it.each([
    ['git status --short -- ~/.ssh/known_hosts', '.ssh/**'],
    ['cat ~/.config/gh/hosts.yml', '.config/gh/**'],
    ['cat /accounts/.npmrc', '.npmrc'],
    ['cat /accounts/.netrc', '.netrc'],
    ['cat ~/.aws/credentials', '.aws/**'],
    ['cat ~/.docker/config.json', '.docker/config.json'],
    [String.raw`git status -- C:\Users\owner\.codex\auth.json`, '.codex/**'],
    ['git status -- "$HOME/.elvaria/treasury.json"', '.elvaria/treasury.json'],
  ])('refuses a command naming a secret place: %s', (command, glob) => {
    expect(commandRefusal(knight, command)).toBe(`names a place that holds secrets (${glob})`);
  });

  it('refuses no place without secret paths: a policy built by hand', () => {
    expect(commandRefusal(policy({}), 'cat ~/.ssh/id_rsa')).toBeUndefined();
  });

  it('refuses GitHub tokens but leaves other auth commands open', () => {
    expect(commandRefusal(knight, 'gh auth token')).toBeDefined();
    expect(commandRefusal(knight, 'gh auth status')).toBeUndefined();
    expect(commandRefusal(knight, 'cat /accounts/project.npmrc')).toBeUndefined();
    expect(commandRefusal(knight, 'cat /accounts/.netrc.example')).toBeUndefined();
  });
});
