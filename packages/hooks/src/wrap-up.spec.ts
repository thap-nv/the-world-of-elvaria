// The soft-ceiling reminder of (F) through runHook, with made-up payloads of the three tribes: Claude Code (probe
// `có`) is reminded once per session at PostToolUse; Codex and agy through one denied PreToolUse per session.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PAYLOADS, SESSION, payload } from './__fixtures__/claude-payloads.ts';
import { tempKingdom } from './__fixtures__/temp.ts';
import { DEFER_TO_SETTINGS } from './antigravity/translate.ts';
import { runHook } from './run-hook.ts';
import { WRAP_UP_FILE, readWrapUp, wrapsUp } from './wrap-up.ts';
import type { TempKingdom } from './__fixtures__/temp.ts';

const NOW = Date.parse('2026-11-15T10:00:00Z');
const SIGNAL = { version: 1, measure: 'tokens', used: 344_000, limit: 400_000, pct: 86 };

let kingdom: TempKingdom;
let policy: string;
beforeEach(async () => {
  kingdom = await tempKingdom();
  policy = path.join(kingdom.runDir, 'policy.json');
  await writeFile(policy, JSON.stringify({ version: 1, laws: {} }), 'utf8');
});
afterEach(() => kingdom.remove());

const writeSignal = (body: unknown) =>
  writeFile(
    path.join(kingdom.runDir, WRAP_UP_FILE),
    typeof body === 'string' ? body : JSON.stringify(body),
    'utf8',
  );

const call = async (raw: unknown, argv: string[] = [], role = 'assignee') =>
  runHook({
    stdin: JSON.stringify(raw),
    env: kingdom.env({ ELVARIA_ROLE: role }),
    argv: ['--policy', policy, ...argv],
    now: NOW,
  });

// Written out by hand: the words the model reads are the contract.
const TEXT =
  'Elvaria: this session has used 86% of its tokens limit (344000 of 400000). Start no new work. ' +
  'Commit what you have, write the handover letter (Where I am / Done / Not done / Next step), then end the session.';
const NO_SHELL_TEXT =
  'Elvaria: this session has used 86% of its tokens limit (344000 of 400000). Start no new work. ' +
  'Write the handover letter (Where I am / Done / Not done / Next step), then end the session; ' +
  'the Steward commits what you leave in the plot.';
const HELD_BACK =
  'This one tool call was held back to tell you so; nothing else is blocked, so make it again if you need it.';

const REMINDER = `${JSON.stringify({
  hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: TEXT },
})}\n`;

describe('wrap-up reminder, Claude Code (probe: có)', () => {
  it('reminds once at PostToolUse, then stays silent', async () => {
    await writeSignal(SIGNAL);
    const first = await call(PAYLOADS.PostToolUse);
    expect(first).toEqual({ stdout: REMINDER, stderr: '' });
    expect((await call(PAYLOADS.PostToolUse)).stdout).toBe('');
    // The tool line is written either way.
    expect((await kingdom.log()).events.map(({ type }) => type)).toEqual(['agent.tool', 'agent.tool']);
  });

  it('reminds a later session of the same run again, once', async () => {
    await writeSignal(SIGNAL);
    expect((await call(PAYLOADS.PostToolUse)).stdout).toBe(REMINDER);
    const next = payload('PostToolUse', { session_id: 'next/session' });
    expect((await call(next)).stdout).toBe(REMINDER);
    expect((await call(next)).stdout).toBe('');
  });

  it('is silent without the file, and with a damaged or unknown one', async () => {
    expect(await call(PAYLOADS.PostToolUse)).toEqual({ stdout: '', stderr: '' });
    for (const body of [
      '{"version":1,',
      '[]',
      'null',
      { ...SIGNAL, version: 2 },
      { ...SIGNAL, measure: 'mana' },
      { ...SIGNAL, used: '344000' },
      { ...SIGNAL, pct: -1 },
    ]) {
      await writeSignal(body);
      expect(await call(PAYLOADS.PostToolUse)).toEqual({ stdout: '', stderr: '' });
    }
    // A damaged file left no marker: once it is right, the reminder still comes.
    await writeSignal(SIGNAL);
    expect((await call(PAYLOADS.PostToolUse)).stdout).toBe(REMINDER);
  });

  it('never answers PreToolUse, nor a call another decision already answered', async () => {
    await writeSignal(SIGNAL);
    const read = payload('PreToolUse', { tool_name: 'Read', tool_input: { file_path: 'a.ts' } });
    expect((await call(read, ['--event', 'PreToolUse'])).stdout).toBe('');
    const stop = await call(PAYLOADS.Stop);
    expect(stop.stdout).toMatch(/"decision":"block"/);
    expect(stop.stdout).not.toMatch(/additionalContext/);
    // Neither used up the one reminder.
    expect((await call(PAYLOADS.PostToolUse)).stdout).toBe(REMINDER);
  });

  it("waits for the session's own call: not a verifier's, not an apprentice's", async () => {
    await writeSignal(SIGNAL);
    expect((await call(PAYLOADS.PostToolUse, [], 'verifier')).stdout).toBe('');
    const apprentice = payload('PostToolUse', { agent_id: 'a1', agent_type: 'apprentice' });
    expect((await call(apprentice)).stdout).toBe('');
    expect((await call(PAYLOADS.PostToolUse)).stdout).toBe(REMINDER);
  });

  it('stays silent and says why when the marker cannot be written', async () => {
    await writeSignal(SIGNAL);
    // A file where the hook's state folder should be: mkdir fails.
    await writeFile(path.join(kingdom.runDir, 'hook'), 'x', 'utf8');
    const outcome = await call(PAYLOADS.PostToolUse);
    expect(outcome.stdout).toBe('');
    expect(outcome.stderr).toMatch(/^elvaria-hook: wrap-up reminder not given: /m);
  });
});

const HELD = `${TEXT} ${HELD_BACK}`;
const codexCall = (tool: string, input: Record<string, unknown>) =>
  payload('PreToolUse', { tool_name: tool, tool_input: input });
const CODEX = ['--dialect', 'codex'];
const codexDeny = (reason: string) =>
  `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  })}\n`;
const CODEX_DENY = codexDeny(HELD);

describe('wrap-up reminder, Codex: one PreToolUse held back per session', () => {
  it('denies the first call with the reminder as its reason, then lets every call through', async () => {
    expect((await call(codexCall('Bash', { command: 'ls' }), CODEX)).stdout).toBe('');
    await writeSignal(SIGNAL);
    expect(await call(codexCall('Bash', { command: 'ls' }), CODEX)).toEqual({
      stdout: CODEX_DENY,
      stderr: '',
    });
    expect((await call(codexCall('Bash', { command: 'ls' }), CODEX)).stdout).toBe('');
    // PostToolUse carries nothing: the route is the deny.
    expect((await call(PAYLOADS.PostToolUse, CODEX)).stdout).toBe('');
  });

  it('never holds back the letter, a commit, an assistant, or a call a rule already denied', async () => {
    await writeSignal(SIGNAL);
    const letter = path.join(kingdom.root, 'quests', 'q', 'handover.md');
    const patch = `*** Begin Patch\n*** Update File: ${letter}\n@@\n-a\n+b\n*** End Patch`;
    for (const [tool, input] of [
      ['apply_patch', { command: patch }],
      ['Bash', { command: 'git add -A && git -c core.hooksPath=x commit -m "wip"' }],
      ['Bash', { command: `cat > ${letter}` }],
    ] as const) {
      expect((await call(codexCall(tool, input), CODEX)).stdout).toBe('');
    }
    const asked = await call(codexCall('request_user_input', {}), CODEX);
    expect(asked.stdout).toMatch(/nobody answers inside this session/);
    expect((await call(codexCall('Bash', { command: 'ls' }), CODEX, 'verifier')).stdout).toBe('');
    // None of them used up the one reminder.
    expect((await call(codexCall('Bash', { command: 'git log --grep commit' }), CODEX)).stdout).toBe(
      CODEX_DENY,
    );
  });

  it('tells a class without a shell that the Steward commits', async () => {
    await writeFile(
      policy,
      JSON.stringify({ version: 1, laws: {}, tools: ['Read', 'Edit', 'Write'] }),
      'utf8',
    );
    await writeSignal(SIGNAL);
    const patch = '*** Begin Patch\n*** Add File: notes.md\n+a\n*** End Patch';
    const outcome = await call(codexCall('apply_patch', { command: patch }), CODEX);
    expect(outcome.stdout).toBe(codexDeny(`${NO_SHELL_TEXT} ${HELD_BACK}`));
  });
});

const agyCall = (name: string, args: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  conversationId: SESSION,
  lastUserInput: 'Do the quest.',
  workspacePaths: [kingdom.root.replaceAll('\\', '/')],
  toolCall: { name, args },
  ...extra,
});
const DEFER = `${JSON.stringify(DEFER_TO_SETTINGS)}\n`;

describe('wrap-up reminder, agy: one PreToolUse held back per session', () => {
  it('denies the first call in place of the settings answer, then defers again', async () => {
    const read = agyCall('read_file', { AbsolutePath: path.join(kingdom.root, 'README.md') });
    expect((await call(read, ['PreToolUse'])).stdout).toBe(DEFER);
    await writeSignal(SIGNAL);
    expect(await call(read, ['PreToolUse'])).toEqual({
      stdout: `${JSON.stringify({ decision: 'deny', reason: HELD })}\n`,
      stderr: '',
    });
    expect((await call(read, ['PreToolUse'])).stdout).toBe(DEFER);
    expect((await call(read, ['PostToolUse'])).stdout).toBe('');
  });

  it("waits for the session's own call that is not the letter, and keeps a deny already made", async () => {
    await writeSignal(SIGNAL);
    const letter = path.join(kingdom.root, 'quests', 'q', 'handover.md');
    const write = agyCall('write_to_file', { TargetFile: letter, CodeContent: 'x' });
    expect((await call(write, ['PreToolUse'])).stdout).toBe(DEFER);
    const sub = agyCall('read_file', { AbsolutePath: 'README.md' }, { lastUserInput: '' });
    expect((await call(sub, ['PreToolUse'])).stdout).toBe(DEFER);
    expect((await call(agyCall('ask_question', {}), ['PreToolUse'])).stdout).toMatch(/nobody answers/);
    expect((await call(agyCall('list_dir', { DirectoryPath: '.' }), ['PreToolUse'])).stdout).toMatch(
      /"decision":"deny","reason":"Elvaria: this session has used 86%/,
    );
  });

  it('keeps the settings answer, and says why, when the marker cannot be written', async () => {
    await writeSignal(SIGNAL);
    await writeFile(path.join(kingdom.runDir, 'hook'), 'x', 'utf8');
    const outcome = await call(agyCall('list_dir', { DirectoryPath: '.' }), ['PreToolUse']);
    expect(outcome.stdout).toBe(DEFER);
    expect(outcome.stderr).toMatch(/^elvaria-hook: wrap-up reminder not given: /m);
  });
});

describe('wrapsUp', () => {
  const tool = (paths: string[], command?: string) => ({
    kind: 'other' as const,
    paths,
    guarded: paths,
    command,
    url: undefined,
    subagent: undefined,
    model: undefined,
  });

  it('reads the letter in a path or a shell line, and a commit under any options', () => {
    expect(wrapsUp(tool(['C:\\k\\quests\\q\\handover.md']))).toBe(true);
    expect(wrapsUp(tool(['/k/quests/q/handover.md']))).toBe(true);
    expect(wrapsUp(tool([], 'git -C . commit -m x'))).toBe(true);
    expect(wrapsUp(tool([], 'git --no-pager commit --amend'))).toBe(true);
    expect(wrapsUp(tool(['src/handover.md.bak']))).toBe(false);
    expect(wrapsUp(tool([], 'git log --grep commit'))).toBe(false);
    expect(wrapsUp(tool(['a.ts']))).toBe(false);
  });
});

describe('readWrapUp', () => {
  it('reads the v1 shape and nothing else', async () => {
    expect(readWrapUp(kingdom.runDir)).toBeUndefined();
    await writeSignal({ ...SIGNAL, extra: true });
    expect(readWrapUp(kingdom.runDir)).toEqual({ measure: 'tokens', used: 344_000, limit: 400_000, pct: 86 });
    await mkdir(path.join(kingdom.root, 'empty'));
    expect(readWrapUp(path.join(kingdom.root, 'empty'))).toBeUndefined();
  });
});
