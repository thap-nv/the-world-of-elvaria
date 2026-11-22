// The fence on the places that hold the owner's secrets (SEC-01): shell lines in bash, cmd and PowerShell, and code a
// line runs, that name one outside the plot are refused; the plot's own folders of the same names stay open.
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { tempKingdom } from './__fixtures__/temp.ts';
import { compileLaws } from './laws.ts';
import { runHook } from './run-hook.ts';
import { secretPlaceViolation } from './secret-place.ts';
import type { TempKingdom } from './__fixtures__/temp.ts';
import type { ToolCall } from './claude/tools.ts';

/** runner-core's SECRET_PATHS as policy.json carries them. */
const SECRET_PATHS = [
  '.config/gh/**',
  '.npmrc',
  '.netrc',
  '.aws/**',
  '.docker/config.json',
  '.ssh/**',
  '.git-credentials',
  '.config/git/credentials',
  '.elvaria/treasury.json',
  '.elvaria/accounts/**',
  '.claude/**',
  '.claude.json',
  '.codex/**',
  '.gemini/**',
];
const LAWS = compileLaws({}, { secretPaths: SECRET_PATHS });
const PLOT = path.resolve('/work/dc1 repo/.elvaria/worktrees/q_20261121_s3cr3t');

const shell = (command: string): ToolCall => ({
  kind: 'bash',
  paths: [],
  guarded: [],
  command,
  url: undefined,
  subagent: undefined,
  model: undefined,
});
const read = (file: string): ToolCall => ({
  ...shell(''),
  kind: 'read',
  paths: [file],
  guarded: [file],
  command: undefined,
});
const refusal = (call: ToolCall): string | undefined => secretPlaceViolation(call, PLOT, LAWS);

describe('secretPlaceViolation', () => {
  it.each([
    ['cat ~/.ssh/id_rsa', '.ssh/**'],
    ['cat ~/.config/gh/hosts.yml', '.config/gh/**'],
    ['cat ~/.npmrc', '.npmrc'],
    ['cat ~/.netrc', '.netrc'],
    ['cat .npmrc', '.npmrc'],
    ['cat nested/.netrc', '.netrc'],
    ['cat ~/.aws/credentials', '.aws/**'],
    ['cat ~/.docker/config.json', '.docker/config.json'],
    [String.raw`type %USERPROFILE%\.ssh\id_ed25519`, '.ssh/**'],
    [String.raw`Get-Content $env:USERPROFILE\.claude\.credentials.json`, '.claude/**'],
    ['cat "${HOME}/.codex/auth.json"', '.codex/**'],
    ['cat ../../../../../.git-credentials', '.git-credentials'],
    [String.raw`type C:\Users\owner\.elvaria\treasury.json`, '.elvaria/treasury.json'],
    ['ls /Users/owner/.elvaria/accounts/claude_2', '.elvaria/accounts/**'],
    ['cat ~/.config/git/credentials', '.config/git/credentials'],
    [
      `node -e "require('fs').readFileSync(require('path').join(require('os').homedir(), '.gemini', 'oauth_creds.json'))"`,
      '.gemini/**',
    ],
    ['Get-Content (Join-Path $HOME .claude.json)', '.claude.json'],
    ['cd ~ && cat .claude/.credentials.json', '.claude/**'],
    [String.raw`Set-Location C:\Users\owner; Get-ChildItem .ssh`, '.ssh/**'],
  ])('refuses %s', (command, glob) => {
    expect(refusal(shell(command))).toContain(`(${glob})`);
  });

  it('refuses a read tool on a secret place, whatever spelling Windows accepts', () => {
    expect(refusal(read(String.raw`C:\Users\owner\.SSH\id_rsa`))).toContain('(.ssh/**)');
    expect(refusal(read('/Users/owner/.codex/auth.json'))).toContain('(.codex/**)');
  });

  it.each([
    'cat .claude/rules/runner.md',
    'git diff HEAD~1 -- .claude/rules/hooks.md',
    'grep -rn hook --exclude-dir=.codex .',
    `cat "${path.join(PLOT, '.gemini', 'settings.json')}"`,
    'git status --short',
    'cat ~/.npmrc.example',
    'cat ~/.netrc-backup',
    'cat ~/.docker/config.json.example',
    'gh auth status',
  ])("keeps the plot's own folders open: %s", (command) => {
    expect(refusal(shell(command))).toBeUndefined();
  });

  it("lets a tool read the plot's own .claude folder", () => {
    expect(refusal(read('.claude/settings.json'))).toBeUndefined();
    expect(refusal(read(path.join(PLOT, '.claude', 'rules', 'runner.md')))).toBeUndefined();
  });

  it('refuses nothing without secret paths: a policy written before SEC-01', () => {
    expect(secretPlaceViolation(shell('cat ~/.ssh/id_rsa'), PLOT, compileLaws({}))).toBeUndefined();
  });

  it('refuses GitHub tokens', () => {
    expect(refusal(shell('gh auth token'))).toContain('gh auth token');
  });

  it('fences configured places even inside the plot, with spaces and Windows spellings', () => {
    const laws = compileLaws(
      {},
      {
        secretPaths: [`${PLOT.replaceAll('\\', '/')}/private accounts/**`, 'C:/private vault/treasury.json'],
      },
    );
    expect(
      secretPlaceViolation(read(path.join(PLOT, 'private accounts', 'auth.json')), PLOT, laws),
    ).toContain('private accounts/**');
    expect(secretPlaceViolation(shell('cat "c:\\PRIVATE VAULT\\treasury.json"'), PLOT, laws)).toContain(
      'C:/private vault/treasury.json',
    );
    expect(secretPlaceViolation(read('private accounts/auth.json'), PLOT, laws)).toContain(
      'private accounts/**',
    );
    expect(secretPlaceViolation(read('C:/private vault/treasury.json.example'), PLOT, laws)).toBeUndefined();
  });
});

describe('the hook, through a CLI', () => {
  let kingdom: TempKingdom;
  let policy: string;
  beforeEach(async () => {
    kingdom = await tempKingdom();
    policy = path.join(kingdom.runDir, 'policy.json');
    await writeFile(policy, JSON.stringify({ version: 1, secret_paths: SECRET_PATHS }), 'utf8');
  });
  afterEach(() => kingdom.remove());

  it.each(['claude', 'codex', 'antigravity'])('fences every SEC-01b probe through %s', async (cli) => {
    const treasury = path.resolve('/custom vault/values.json').replaceAll('\\', '/');
    const account = path.resolve('/custom accounts/tribe').replaceAll('\\', '/');
    await writeFile(
      policy,
      JSON.stringify({
        version: 1,
        secret_paths: [...SECRET_PATHS, treasury, `${account}/**`],
      }),
      'utf8',
    );
    const commands = [
      `git status -- "${treasury}"`,
      `git status -- "${account}/auth.json"`,
      'gh auth token',
      'cat ~/.config/gh/hosts.yml',
      'cat ~/.npmrc',
      'cat ~/.netrc',
      'cat ~/.aws/credentials',
      'cat ~/.docker/config.json',
    ];
    for (const command of commands) {
      const payload =
        cli === 'antigravity'
          ? {
              conversationId: 's',
              workspacePaths: [PLOT],
              toolCall: { name: 'run_command', args: { CommandLine: command } },
            }
          : {
              session_id: 's',
              cwd: PLOT,
              hook_event_name: 'PreToolUse',
              tool_name: 'Bash',
              tool_input: { command },
            };
      const outcome = await runHook({
        stdin: JSON.stringify(payload),
        env: kingdom.env(),
        argv: [
          '--policy',
          policy,
          ...(cli === 'codex' ? ['--dialect', 'codex'] : []),
          ...(cli === 'antigravity' ? ['PreToolUse'] : ['--event', 'PreToolUse']),
        ],
        now: Date.parse('2026-11-22T12:00:00Z'),
      });
      const answer = JSON.parse(outcome.stdout) as {
        decision?: string;
        reason?: string;
        hookSpecificOutput?: { permissionDecision: string; permissionDecisionReason: string };
      };
      expect(answer.decision ?? answer.hookSpecificOutput?.permissionDecision, command).toBe('deny');
      expect(answer.reason ?? answer.hookSpecificOutput?.permissionDecisionReason, command).toContain(
        'secrets',
      );
    }
  });

  it.each([
    ['claude', []],
    ['codex', ['--dialect', 'codex']],
  ])('refuses a shell line naming a secret place as a rule of Elvaria (%s)', async (_cli, dialect) => {
    const payload = {
      session_id: 's',
      cwd: PLOT,
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'cat ~/.ssh/id_rsa' },
    };
    const outcome = await runHook({
      stdin: JSON.stringify(payload),
      env: kingdom.env(),
      argv: ['--policy', policy, ...dialect, '--event', 'PreToolUse'],
      now: Date.parse('2026-11-21T12:00:00Z'),
    });
    const answer = JSON.parse(outcome.stdout) as { hookSpecificOutput: Record<string, string> };
    expect(answer.hookSpecificOutput.permissionDecision).toBe('deny');
    expect(answer.hookSpecificOutput.permissionDecisionReason).toMatch(
      /^Elvaria rule: ~\/\.ssh\/id_rsa names a place that holds the owner's secrets \(\.ssh\/\*\*\)/,
    );
  });
});
