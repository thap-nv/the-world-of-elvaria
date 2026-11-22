import path from 'node:path';
import { homedir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { toolPolicyOf } from './tool-policy.ts';
import { commandRefusal } from './command-refusal.ts';

const policy = (secretPaths: readonly string[]) =>
  toolPolicyOf({
    role: 'assignee',
    characterClass: { tools: { allow: ['Bash'], deny: [] } },
    secret_paths: secretPaths,
  });

describe('configured secret paths', () => {
  it('resolves home and dot segments, preserving spaces and the default fence', () => {
    const fenced = policy(['~/private vault/../vault.json', '~/accounts/**']);
    expect(commandRefusal(fenced, `cat "${path.join(homedir(), 'vault.json')}"`)).toBeDefined();
    expect(commandRefusal(fenced, `cat "${path.join(homedir(), 'accounts', 'auth.json')}"`)).toBeDefined();
    expect(commandRefusal(fenced, 'cat ~/.aws/credentials')).toBeDefined();
    expect(commandRefusal(fenced, `cat "${path.join(homedir(), 'vault.json.example')}"`)).toBeUndefined();
  });

  it('normalizes Windows separators and case without duplicating configured entries', () => {
    const fenced = policy([String.raw`C:\Private Vault\..\Accounts\**`, 'c:/accounts/**']);
    expect(fenced.secret_paths?.filter((glob) => glob === 'c:/accounts/**')).toEqual(['c:/accounts/**']);
    expect(commandRefusal(fenced, String.raw`cat "C:\ACCOUNTS\auth.json"`)).toBeDefined();
    expect(commandRefusal(fenced, 'cat c:/accounts-other/auth.json')).toBeUndefined();
  });

  it('treats glob characters in configured names literally', () => {
    const fenced = policy(['C:/accounts/[personal]/**']);
    expect(commandRefusal(fenced, 'cat C:/accounts/[personal]/auth.json')).toBeDefined();
    expect(commandRefusal(fenced, 'cat C:/accounts/p/auth.json')).toBeUndefined();
  });

  it('keeps an absent or empty list compatible with the default policy', () => {
    expect(policy([]).secret_paths).toContain('.codex/**');
  });
});
