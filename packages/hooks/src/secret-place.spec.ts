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
