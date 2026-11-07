import { toolPolicyOf } from '@elvaria/runner-core';
import { describe, expect, it } from 'vitest';

import { agentsOf } from './agents.ts';
import {
  HOOK_EVENTS,
  absoluteRulePath,
  allowRules,
  letterRules,
  scopedRule,
  settingsOf,
  settingsProblems,
} from './settings.ts';
import type { ClaudeSettings } from './settings.ts';

const knight = toolPolicyOf({
  role: 'assignee',
  characterClass: {
    tools: {
      allow: [
        'Read',
        'Edit',
        'Write',
        'NotebookEdit',
        'Glob',
        'Grep',
        'Bash(pnpm test:*)',
        'Agent(apprentice)',
      ],
      deny: ['WebFetch'],
    },
  },
});
const verifier = toolPolicyOf({
  role: 'verifier',
  characterClass: { tools: { allow: ['Read', 'Edit', 'Glob'], deny: [] } },
});
const HOOK = {
  command: process.execPath,
  args: ['--conditions=elvaria-dist', '/hooks/dist/elvaria-hook.js', '--policy', '/run/policy.json'],
};

describe('settingsOf', () => {
  it('scopes file tools to the plot and keeps every other rule', () => {
    expect(
      ['Read', 'Edit', 'Write', 'NotebookEdit', 'Glob', 'Bash(pnpm test:*)', 'Read(./x)'].map(scopedRule),
    ).toEqual([
      'Read(./**)',
      'Edit(./**)',
      'Write(./**)',
      'NotebookEdit(./**)',
      'Glob',
      'Bash(pnpm test:*)',
      'Read(./x)',
    ]);
    const { permissions } = settingsOf(knight, HOOK, {});
    expect(permissions.allow).not.toContain('Agent(apprentice)');
    expect(permissions.deny).toEqual(knight.deny);
  });

  it('gives Glob and Grep no rule: a bare one searched outside the plot, none keeps them inside (live run)', () => {
    expect(allowRules(['Read', 'Glob', 'Grep', 'Glob(src/**)', 'Bash(pnpm test:*)'])).toEqual([
      'Read(./**)',
      'Glob(src/**)',
      'Bash(pnpm test:*)',
    ]);
    const { permissions } = settingsOf(knight, HOOK, {});
    expect(permissions.allow).not.toContain('Glob');
    expect(permissions.allow).not.toContain('Grep');
    expect(knight.tools).toEqual(expect.arrayContaining(['Glob', 'Grep']));
  });

  it('gives a verifier no write rule and denies the write tools', () => {
    const { permissions } = settingsOf(verifier, HOOK, {});
    expect(permissions.allow).toEqual(['Read(./**)']);
    expect(permissions.deny).toEqual(expect.arrayContaining(['Edit', 'Write', 'NotebookEdit']));
  });

  it('declares the hook on all twelve events, blocking only when PreToolUse fails', () => {
    const { hooks } = settingsOf(knight, HOOK, {});
    expect(Object.keys(hooks)).toEqual([...HOOK_EVENTS]);
    const failing = HOOK_EVENTS.filter((event) => hooks[event]?.[0]?.hooks[0]?.onFailure === 'block');
    expect(failing).toEqual(['PreToolUse']);
    expect(hooks.SessionStart).toEqual([{ hooks: [{ type: 'command', ...HOOK, timeout: 5 }] }]);
  });

  it('lets an assignee read and write its letter, outside the plot, by absolute path', () => {
    expect(absoluteRulePath(String.raw`D:\Dummy\Tool - Personal\k\quests\q\handover.md`)).toBe(
      '//d/Dummy/Tool - Personal/k/quests/q/handover.md',
    );
    expect(absoluteRulePath('/Users/thu/k/quests/q/handover.md')).toBe('//Users/thu/k/quests/q/handover.md');
    const { permissions } = settingsOf(knight, HOOK, {}, '/k/quests/q/handover.md');
    expect(permissions.allow.slice(-3)).toEqual(letterRules('/k/quests/q/handover.md'));
    expect(letterRules('/k/h.md')).toEqual(['Read(//k/h.md)', 'Edit(//k/h.md)', 'Write(//k/h.md)']);
    expect(settingsProblems(settingsOf(knight, HOOK, {}, String.raw`C:\a b\h.md`))).toEqual([]);
  });

  it('is sound as generated', () => {
    expect(
      settingsProblems(settingsOf(knight, HOOK, { ELVARIA_QUEST: 'q', CLAUDE_CODE_MAX_RETRIES: '2' })),
    ).toEqual([]);
  });
});

describe('settingsProblems', () => {
  const sound = settingsOf(knight, HOOK, {});

  it('names what Claude Code would drop without a word', () => {
    const { SessionStart: _gone, ...hooks } = sound.hooks;
    const broken: ClaudeSettings = {
      ...sound,
      permissions: { ...sound.permissions, allow: ['Bash(pnpm test:*', ' Read'] },
      env: { 'NOT A NAME': 'x' },
      hooks: {
        ...hooks,
        Stop: [{ hooks: [{ type: 'command', command: 'node', args: [], timeout: 0 }] }],
      },
    };
    expect(settingsProblems(broken)).toEqual([
      'permission rule "Bash(pnpm test:*" is malformed',
      'permission rule " Read" is malformed',
      'env "NOT A NAME" is malformed',
      'hooks.SessionStart is missing',
      'hooks.Stop: command is not an absolute path',
      'hooks.Stop: bad timeout',
    ]);
  });

  it('refuses args that are not strings', () => {
    const args = [1] as unknown as string[];
    const broken: ClaudeSettings = {
      ...sound,
      hooks: {
        ...sound.hooks,
        Stop: [{ hooks: [{ type: 'command', command: process.execPath, args, timeout: 5 }] }],
      },
    };
    expect(settingsProblems(broken)).toEqual(['hooks.Stop: args is not a list of strings']);
  });
});

describe('agentsOf', () => {
  it('defines one apprentice with the character tools minus Agent', () => {
    expect(agentsOf(knight, { model: 'haiku', max_turns: 30 })).toEqual({
      apprentice: {
        description: expect.stringContaining('apprentice') as string,
        prompt: expect.stringContaining('cannot start another agent') as string,
        tools: ['Read', 'Edit', 'Write', 'NotebookEdit', 'Glob', 'Grep', 'Bash'],
        model: 'haiku',
        maxTurns: 30,
        omitClaudeMd: false,
      },
    });
  });

  it('defines none for a character that may not start one', () => {
    expect(agentsOf(verifier, { model: 'haiku', max_turns: 30 })).toBeUndefined();
  });
});
