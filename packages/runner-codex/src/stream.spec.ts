// The stream reader against the runs recorded by the spike (fixtures/stream-*.jsonl, Codex 0.167.0-alpha.4.1) and
// the usage-limit run built from the binary's own words (constructed-usage-limit.jsonl).
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FIXTURES } from './__fixtures__/codex.ts';
import { blockedOf, lineSplitter, outcomeOf, rateLimitOf } from './outcome.ts';
import { createStreamReader } from './stream.ts';
import type { RunnerSignal } from '@elvaria/runner-core';

function replay(name: string) {
  const reader = createStreamReader();
  const signals: RunnerSignal[] = [];
  const text = readFileSync(path.join(FIXTURES, `${name}.jsonl`), 'utf8');
  for (const line of text.split('\n')) signals.push(...reader.read(line));
  return { state: reader.state, signals };
}

describe('createStreamReader', () => {
  it('names the session, keeps the answer and counts the tokens of a minimal run, cache reads at a tenth', () => {
    const { state, signals } = replay('stream-minimal');
    expect(state.session).toBe('01a1cf95-e08d-71e1-bed5-98e42e14bdd3');
    expect(state.messages).toEqual(['OK']);
    // 13 001 in, of which 10 496 cached; 5 out: 2 505 + 5 + ceil(10 496 / 10).
    expect(state.tokens).toBe(2510 + 1050);
    expect(state.completed).toBe(true);
    expect(signals).toEqual([
      { kind: 'text', text: 'OK' },
      { kind: 'usage', tokens: 3560 },
    ]);
  });

  it('counts each tool call and message once, a file change without its start line included', () => {
    const { state } = replay('stream-commands');
    // Two messages, four shell calls, one file change.
    expect(state.turns).toBe(7);
    expect(state.started).toBe(7);
    expect(state.failure).toBeUndefined();
  });

  it('keeps the structured answer as the last message, and a resumed run under its own id', () => {
    expect(replay('stream-structured').state.messages.at(-1)).toBe(
      '{"result":"pass","notes":"AGENTS.md names a flower: TULIP."}',
    );
    expect(replay('stream-resume').state.session).toBe('01a1cf9e-8df5-7370-94a1-9154929c9ed2');
  });

  it('sees a killed run as begun and never completed', () => {
    const { state } = replay('stream-killed');
    expect(state).toMatchObject({ completed: false, started: 1, turns: 0, tokens: 0 });
  });

  it('reads a failed turn and its error', () => {
    const { state } = replay('stream-bad-model');
    expect(state.failure).toMatch(/not supported when using Codex with a ChatGPT account/);
    expect(state.last_error).toBe(state.failure);
    expect(rateLimitOf(state)).toBeUndefined();
  });

  it('counts a sub-agent call as an action of its own', () => {
    expect(replay('stream-subagent').state.turns).toBe(3);
  });

  it('skips lines that are not JSON objects', () => {
    const reader = createStreamReader();
    expect([...reader.read('not json'), ...reader.read('[1]'), ...reader.read('{"type":"x"}')]).toEqual([]);
    expect(reader.state.session).toBeUndefined();
  });
});

describe('the end of a run', () => {
  it('is a rate limit when the account ran out of usage', () => {
    const { state } = replay('constructed-usage-limit');
    expect(rateLimitOf(state)).toMatch(/hit your usage limit/);
    expect(outcomeOf({ exit_code: 1, state, stopped: undefined })).toBe('error');
  });

  it('is completed only when the turn completed with exit 0, and a stop wins', () => {
    const done = { completed: true, failure: undefined };
    expect(outcomeOf({ exit_code: 0, state: done, stopped: undefined })).toBe('completed');
    expect(outcomeOf({ exit_code: 1, state: done, stopped: undefined })).toBe('error');
    expect(
      outcomeOf({ exit_code: 0, state: { completed: false, failure: undefined }, stopped: undefined }),
    ).toBe('error');
    expect(outcomeOf({ exit_code: null, state: done, stopped: 'killed' })).toBe('killed');
    expect(outcomeOf({ exit_code: null, state: done, stopped: 'max_turns' })).toBe('max_turns');
  });

  it("reads the hook's refusal from Codex's stderr, with the command when it was a shell call", () => {
    const line = readFileSync(path.join(FIXTURES, 'stream-hooks.stderr.txt'), 'utf8').split('\n')[0] ?? '';
    expect(blockedOf(line)).toEqual({
      tool: 'Bash',
      detail: 'git push origin main',
      reason: 'Elvaria law of this territory: git push is forbidden.',
    });
    expect(blockedOf('error=Patch blocked by PreToolUse hook: no.')).toEqual({
      tool: 'unknown',
      detail: 'no.',
      reason: 'no.',
    });
    expect(blockedOf('Reading additional input from stdin...')).toBeUndefined();
  });

  it('splits stderr into whole lines across chunks', () => {
    const lines: string[] = [];
    const splitter = lineSplitter((line) => lines.push(line));
    splitter.push('one\r\ntw');
    splitter.push('o\nthr');
    splitter.end();
    splitter.end();
    expect(lines).toEqual(['one', 'two', 'thr']);
  });
});
