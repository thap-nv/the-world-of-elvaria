import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';

import { CONFORMANCE_QUEST, STDERR_FILE, STDOUT_FILE } from '@elvaria/runner-core';
import type { RunnerSignal, RunningSession, Workspace } from '@elvaria/runner-core';
import { afterEach, describe, expect, it } from 'vitest';

import { FAKE_HOOK, prepare, silentHookCommand } from './__fixtures__/harness.ts';
import { AGENTS_FILE, PROMPT_FILE, SETTINGS_FILE, SYSTEM_FILE } from './run-files.ts';
import type { Prepared } from './__fixtures__/harness.ts';
import { letterRules } from './settings.ts';
import type { ClaudeSettings } from './settings.ts';

const opened: Workspace[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((workspace) => workspace.remove()));
});

async function play(
  prepared: Prepared,
  drive?: (session: RunningSession, signals: readonly RunnerSignal[]) => Promise<void>,
) {
  opened.push(prepared.workspace);
  const session = await prepared.runner.spawn(prepared.request);
  const signals: RunnerSignal[] = [];
  const reading = (async () => {
    for await (const signal of session.signals) signals.push(signal);
  })();
  if (drive !== undefined) await drive(session, signals);
  const result = await session.wait();
  await reading;
  return { session, result, signals };
}

const readJson = async (file: string): Promise<unknown> =>
  JSON.parse(await readFile(file, 'utf8')) as unknown;

async function journal(workspace: Workspace) {
  const text = await readFile(
    path.join(workspace.root, 'quests', CONFORMANCE_QUEST, 'journal.jsonl'),
    'utf8',
  );
  return text
    .trimEnd()
    .split('\n')
    .map((line) => JSON.parse(line) as { type: string; session?: string; data: Record<string, unknown> });
}

describe('a session', () => {
  it('runs Claude Code headless with the run files of §3.7', async () => {
    // A git variable in the Steward's env (husky's pre-push exports GIT_DIR, §6) must not reach the CLI.
    const prepared = await prepare('submit', {}, { env: { GIT_DIR: '/elsewhere/.git' } });
    const record = path.join(prepared.workspace.root, 'record.json');
    const env = { ...prepared.request.env, FAKE_CLAUDE_RECORD: record };
    const { result } = await play({ ...prepared, request: { ...prepared.request, env } });
    const { run_dir: dir, character } = prepared.request;
    const seen = (await readJson(record)) as {
      argv: string[];
      env: Record<string, string>;
      prompt: string;
      cwd: string;
    };
    expect(seen.argv.slice(0, 4)).toEqual(['-p', '--output-format', 'stream-json', '--verbose']);
    const after = (name: string) => seen.argv[seen.argv.indexOf(name) + 1];
    expect(after('--settings')).toBe(path.join(dir, SETTINGS_FILE));
    expect(after('--append-system-prompt-file')).toBe(path.join(dir, SYSTEM_FILE));
    expect(after('--permission-mode')).toBe('dontAsk');
    expect(after('--model')).toBe(character.model);
    expect(after('--max-turns')).toBe(String(prepared.request.budget.max_turns));
    expect(after('--session-id')).toBe(result.session_id);
    expect(after('--tools')).toBe('Read,Edit,Write,Glob,Grep,Bash');
    expect(after('--setting-sources')).toBe('project,local');
    expect(seen.argv).toContain('--strict-mcp-config');
    expect(seen.argv).toContain('--include-hook-events');
    expect(seen.argv).not.toContain('--agents');
    // The prompt goes on stdin, never in argv (a Windows command line stops at 32 767 characters).
    expect(seen.prompt).toBe(prepared.request.prompt.user);
    expect(seen.argv).not.toContain(prepared.request.prompt.user);
    // The CLI sees its cwd with symlinks resolved: macOS's temp folder /var/… is /private/var/….
    expect(await realpath(seen.cwd)).toBe(await realpath(prepared.request.cwd));
    expect(seen.env).toMatchObject({
      ELVARIA_MODEL: character.model,
      ELVARIA_ROLE: 'assignee',
      CLAUDE_CODE_MAX_RETRIES: '2',
    });
    expect(Object.keys(seen.env).filter((name) => name.startsWith('GIT_'))).toEqual([]);
    expect(await readFile(path.join(dir, SYSTEM_FILE), 'utf8')).toBe(prepared.request.prompt.system);
    expect(await readFile(path.join(dir, PROMPT_FILE), 'utf8')).toBe(prepared.request.prompt.user);
  });

  it('writes settings with the policy, the hook on every event and no attribution', async () => {
    const prepared = await prepare('submit');
    await play(prepared);
    const dir = prepared.request.run_dir;
    const settings = (await readJson(path.join(dir, SETTINGS_FILE))) as ClaudeSettings;
    expect(settings.permissions.defaultMode).toBe('dontAsk');
    expect(settings.permissions.allow).toEqual(
      expect.arrayContaining(['Read(./**)', 'Edit(./**)', 'Write(./**)']),
    );
    expect(settings.permissions.allow).not.toContain('Read');
    expect(settings.permissions.allow).not.toContain('Glob');
    expect(settings.permissions.allow).toEqual(
      expect.arrayContaining(letterRules(prepared.request.handover!)),
    );
    expect(settings.permissions.deny).toEqual(
      expect.arrayContaining(['Bash(git push:*)', 'Read(./.env)', 'Agent(Explore)']),
    );
    expect(settings).toMatchObject({
      autoMemoryEnabled: false,
      attribution: { commit: '', pr: '', sessionUrl: false },
    });
    expect(settings.env).toMatchObject({
      ELVARIA_QUEST: CONFORMANCE_QUEST,
      CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS: '60000',
    });
    const policyFile = path.join(dir, 'policy.json');
    expect(Object.keys(settings.hooks)).toHaveLength(12);
    expect(settings.hooks.PreToolUse).toEqual([
      {
        hooks: [
          {
            type: 'command',
            command: process.execPath,
            args: [FAKE_HOOK, '--policy', policyFile],
            timeout: 5,
            onFailure: 'block',
          },
        ],
      },
    ]);
    expect(settings.hooks.Stop?.[0]?.hooks[0]).not.toHaveProperty('onFailure');
    expect(await readJson(policyFile)).toMatchObject({
      version: 1,
      quest: CONFORMANCE_QUEST,
      model: prepared.request.character.model,
    });
  });

  it('ends with agent.session.end in the journal and keeps the redacted output', async () => {
    const prepared = await prepare('submit');
    const { result, signals } = await play(prepared);
    expect(result).toMatchObject({
      outcome: 'completed',
      exit_code: 0,
      usage: { turns: 1 },
      permission_denials: [],
    });
    expect(signals).toEqual(expect.arrayContaining([{ kind: 'text', text: 'done' }]));
    const lines = await journal(prepared.workspace);
    expect(lines.map(({ type }) => type)).toEqual(['agent.session.start', 'agent.session.end']);
    expect(lines[1]).toMatchObject({
      session: result.session_id,
      data: { outcome: 'completed', usage: result.usage },
    });
    const stdout = await readFile(path.join(prepared.request.run_dir, STDOUT_FILE), 'utf8');
    expect(stdout).toContain('"type":"result"');
  });

  it('declares the apprentice and passes structured output, a budget and a resumed session', async () => {
    const prepared = await prepare(
      'submit',
      { apprentice: { model: 'haiku', max_turns: 7 } },
      {
        request: {
          structured: { type: 'object' },
          budget: { max_turns: 9, max_minutes: 5, max_usd: 0.5 },
          resume: { session_id: 'old-session' },
        },
      },
    );
    const record = path.join(prepared.workspace.root, 'record.json');
    const permissions = {
      ...prepared.request.permissions,
      tools: [...prepared.request.permissions.tools, 'Agent'],
      apprentice: { tools: ['Read', 'Grep'] },
    };
    const request = {
      ...prepared.request,
      permissions,
      env: { ...prepared.request.env, FAKE_CLAUDE_RECORD: record },
    };
    const { result } = await play({ ...prepared, request });
    const { argv } = (await readJson(record)) as { argv: string[] };
    const after = (name: string) => argv[argv.indexOf(name) + 1];
    expect(after('--agents')).toBe(path.join(request.run_dir, AGENTS_FILE));
    expect(after('--json-schema')).toBe('{"type":"object"}');
    expect(after('--max-budget-usd')).toBe('0.5');
    expect(after('--resume')).toBe('old-session');
    expect(argv).not.toContain('--session-id');
    expect(result.session_id).toBe('old-session');
    expect(await readJson(path.join(request.run_dir, AGENTS_FILE))).toMatchObject({
      apprentice: { tools: ['Read', 'Grep'], model: 'haiku', maxTurns: 7, omitClaudeMd: false },
    });
  });
});

describe('what a session reports', () => {
  it('reports a command the hook refused, and the session goes on', async () => {
    const { result, signals } = await play(await prepare('forbidden_command'));
    expect(result.outcome).toBe('completed');
    expect(result.permission_denials).toEqual([{ tool: 'Bash', detail: 'git push origin HEAD' }]);
    const blocked = signals.find((signal) => signal.kind === 'tool_blocked');
    expect(blocked).toMatchObject({ tool: 'Bash' });
    expect(blocked?.kind === 'tool_blocked' && blocked.reason).toMatch(
      /^PreToolUse:Bash hook error: Elvaria/,
    );
  });

  it('pauses for mana on a rate limit, with one mana.signal per retry', async () => {
    const prepared = await prepare('rate_limit');
    const { result, signals } = await play(prepared);
    expect(result).toMatchObject({ outcome: 'error', exit_code: 1, rate_limited: true });
    expect(signals.filter(({ kind }) => kind === 'rate_limit')).toHaveLength(3);
    const lines = await journal(prepared.workspace);
    expect(lines.filter(({ type }) => type === 'mana.signal').map(({ data }) => data)).toEqual([
      { error: 'rate_limit', source: 'api_retry' },
      { error: 'rate_limit', source: 'api_retry' },
    ]);
  });

  it('reads the question of the letter', async () => {
    const { result } = await play(await prepare('ask'));
    expect(result.question).toMatch(/release/);
  });

  it("stops a session that Elvaria's SessionStart hook did not record", async () => {
    const prepared = await prepare('hang', { hookCommand: silentHookCommand });
    const { result, signals } = await play(prepared);
    expect(result.outcome).toBe('error');
    const texts = signals.flatMap((signal) => (signal.kind === 'text' ? [signal.text] : []));
    expect(texts.some((text) => text.includes('SessionStart hook did not record'))).toBe(true);
    expect(await readFile(path.join(prepared.request.run_dir, STDERR_FILE), 'utf8')).toMatch(
      /\[elvaria\] Elvaria's SessionStart/,
    );
  });

  it('refuses to start with settings Claude Code would drop in silence', async () => {
    const prepared = await prepare('submit', { hookCommand: () => ({ command: 'node', args: [] }) });
    opened.push(prepared.workspace);
    await expect(prepared.runner.spawn(prepared.request)).rejects.toThrow(
      /unsound: hooks\.SessionStart: command is not an absolute path/,
    );
  });
});

describe('real runs replayed through the adapter', () => {
  const replay = (file: string) => prepare('submit', {}, { env: { FAKE_CLAUDE_REPLAY: file } });

  it('writes agent.subagent.start and end from the task lines', async () => {
    const prepared = await replay('apprentice-max-turns.jsonl');
    const { result } = await play(prepared);
    expect(result.outcome).toBe('completed');
    const subagents = (await journal(prepared.workspace)).filter(({ type }) =>
      type.startsWith('agent.subagent'),
    );
    expect(subagents.map(({ type, data }) => [type, data])).toEqual([
      ['agent.subagent.start', { agent_type: 'apprentice' }],
      ['agent.subagent.end', { agent_type: 'apprentice', duration_ms: 3527 }],
      ['agent.subagent.start', { agent_type: 'apprentice' }],
      ['agent.subagent.end', { agent_type: 'apprentice', duration_ms: 3501 }],
    ]);
  });

  it('ends a killed run itself: no result and no hook would', async () => {
    const prepared = await replay('killed.jsonl');
    const { result } = await play(prepared, async (session, signals) => {
      // Killed once the runner has read the run's usage, not after a fixed wait: a slow CI machine (macOS) took
      // longer than 300 ms to start the fake CLI, and the kill came before the last assistant line.
      while (!signals.some((signal) => signal.kind === 'usage' && signal.tokens === 4693))
        await new Promise((resolve) => setTimeout(resolve, 20));
      await session.kill('breaker: time');
      await session.kill('again');
    });
    expect(result).toMatchObject({ outcome: 'killed', usage: { tokens: 4693 }, rate_limited: false });
    const end = (await journal(prepared.workspace)).find(({ type }) => type === 'agent.session.end');
    expect(end?.data).toEqual({ outcome: 'killed', usage: { tokens: 4693 } });
    expect(await readFile(path.join(prepared.request.run_dir, STDERR_FILE), 'utf8')).toContain(
      '[elvaria] killed: breaker: time',
    );
  });

  it.each([
    ['error-max-turns.jsonl', 'max_turns'],
    ['error-max-budget.jsonl', 'budget'],
    ['error-model-not-found.jsonl', 'error'],
  ])('ends %s as %s with exit 1', async (file, outcome) => {
    const { result } = await play(await replay(file));
    expect(result).toMatchObject({ outcome, exit_code: 1, rate_limited: false });
  });
});
