import { toolPolicyOf } from '@elvaria/runner-core';
import { describe, expect, it } from 'vitest';

import { agentsOf, apprenticeModelsOf } from './agents.ts';
import {
  CLAUDE_PROTECTED_PATHS,
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

describe('settingsOf: generated files and protected paths (P1-24, P1-28)', () => {
  const elvaria = {
    commands: { generate: ['pnpm docs:gen', 'pnpm schemas'] },
    checks: [],
    vcs: { type: 'git' as const, default_branch: 'main' },
    laws: {
      forbidden_paths: ['.env'],
      read_only_paths: ['docs/glossary.md', 'docs/schemas/**'],
      patch_paths: ['.husky/**'],
      forbidden_commands: [],
      read_before_write: [],
      rank_floor: [],
    },
  };
  const knightClass = { tools: { allow: ['Read', 'Edit', 'Write', 'Bash(git status:*)'], deny: [] } };

  it("lets the knight run the territory's generators and read generated files, never edit them", () => {
    const policy = toolPolicyOf({ role: 'assignee', characterClass: knightClass, territory: elvaria });
    const { permissions } = settingsOf(policy, HOOK, {});
    expect(permissions.allow).toEqual(
      expect.arrayContaining(['Read(./**)', 'Edit(./**)', 'Bash(pnpm docs:gen:*)', 'Bash(pnpm schemas:*)']),
    );
    expect(permissions.deny).toEqual(
      expect.arrayContaining(['Read(./.env)', 'Edit(./docs/glossary.md)', 'Edit(./docs/schemas/**)']),
    );
    expect(permissions.deny.filter((rule) => rule.startsWith('Read(./docs'))).toEqual([]);
  });

  it('gives no allow rule for a path the CLI guards, patched or not: none would be read before its safety check', () => {
    expect(CLAUDE_PROTECTED_PATHS).toEqual(
      expect.arrayContaining(['.husky/**', '.git/**', '.claude/**', '.npmrc']),
    );
    const policy = toolPolicyOf({ role: 'assignee', characterClass: knightClass, territory: elvaria });
    const { permissions } = settingsOf(policy, HOOK, {});
    expect(permissions.allow.filter((rule) => rule.includes('.husky'))).toEqual([]);
  });
});

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

const APPRENTICE_CONFIG = { max_turns: 30, max_minutes: 5 };

describe('agentsOf', () => {
  it('defines one apprentice with the character tools minus Agent, on the cheapest model allowed', () => {
    expect(agentsOf(knight, APPRENTICE_CONFIG, ['haiku', 'sonnet'])).toEqual({
      apprentice: {
        description: expect.stringContaining(
          'unless you name another `model`: sonnet (no stronger one)',
        ) as string,
        prompt: expect.stringContaining('cannot start another agent') as string,
        tools: ['Read', 'Edit', 'Write', 'NotebookEdit', 'Glob', 'Grep', 'Bash'],
        model: 'haiku',
        maxTurns: 30,
        omitClaudeMd: false,
      },
    });
  });

  it('says there is no other model when only one is allowed', () => {
    expect(agentsOf(knight, APPRENTICE_CONFIG, ['haiku'])?.apprentice?.description).toContain(
      'It runs on haiku.',
    );
    expect(agentsOf(knight, APPRENTICE_CONFIG, [])?.apprentice?.model).toBe('haiku');
  });

  it('defines none for a character that may not start one', () => {
    expect(agentsOf(verifier, APPRENTICE_CONFIG, ['haiku'])).toBeUndefined();
  });
});

describe('apprenticeModelsOf', () => {
  it.each([
    ['claude-haiku-5-5', ['haiku']],
    ['claude-sonnet-5-5', ['haiku', 'sonnet']],
    ['claude-opus-5-5-low', ['haiku', 'sonnet', 'opus']],
    ['claude-fable-5-1', ['haiku', 'sonnet', 'opus', 'fable']],
    ['sonnet', ['haiku', 'sonnet']],
    // A model that names no alias gets the cheapest alone: never more than its master by accident.
    ['gemini-4-argon-medium', ['haiku']],
  ])('lets the apprentice of %s run on %j, up to its master', (model, allowed) => {
    expect(apprenticeModelsOf(model)).toEqual(allowed);
  });

  it('follows the ladder it is given', () => {
    expect(apprenticeModelsOf('big-model', ['small', 'big'])).toEqual(['small', 'big']);
  });
});
