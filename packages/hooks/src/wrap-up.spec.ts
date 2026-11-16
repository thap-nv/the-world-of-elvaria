// The soft-ceiling reminder of (F) through runHook, with made-up payloads of the three tribes: Claude Code (probe
// `có`) is reminded once per session at PostToolUse; Codex and agy (`chưa rõ`) answer as they did without the file.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PAYLOADS, SESSION, payload } from './__fixtures__/claude-payloads.ts';
import { tempKingdom } from './__fixtures__/temp.ts';
import { DEFER_TO_SETTINGS } from './antigravity/translate.ts';
import { runHook } from './run-hook.ts';
import { WRAP_UP_FILE, readWrapUp, wrapUpText } from './wrap-up.ts';
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

const REMINDER = `${JSON.stringify({
  hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: wrapUpText(SIGNAL) },
})}\n`;

describe('wrap-up reminder, Claude Code (probe: có)', () => {
  it('reminds once at PostToolUse, then stays silent', async () => {
    await writeSignal(SIGNAL);
    const first = await call(PAYLOADS.PostToolUse);
    expect(first).toEqual({ stdout: REMINDER, stderr: '' });
    expect(wrapUpText(SIGNAL)).toMatch(/86% of its tokens limit \(344000 of 400000\)/);
    expect(wrapUpText(SIGNAL)).toMatch(/Commit what you have, write the handover letter/);
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

describe('wrap-up reminder, tribes the probe left chưa rõ', () => {
  it('Codex: PostToolUse stays silent with the file present', async () => {
    await writeSignal(SIGNAL);
    for (let index = 0; index < 2; index += 1) {
      expect(await call(PAYLOADS.PostToolUse, ['--dialect', 'codex'])).toEqual({ stdout: '', stderr: '' });
    }
    expect((await kingdom.log()).events.map(({ type }) => type)).toEqual(['agent.tool', 'agent.tool']);
  });

  it('agy: PostToolUse stays silent and PreToolUse answers as before', async () => {
    await writeSignal(SIGNAL);
    const agy = { conversationId: SESSION, toolName: 'read_file', toolArgs: { AbsolutePath: 'README.md' } };
    expect((await call(agy, ['PostToolUse'])).stdout).toBe('');
    expect((await call(agy, ['PreToolUse'])).stdout).toBe(`${JSON.stringify(DEFER_TO_SETTINGS)}\n`);
    expect((await call(agy, ['PostToolUse'])).stdout).toBe('');
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
