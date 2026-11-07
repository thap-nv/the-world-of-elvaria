// The streams agy 1.5.2 really printed (spike P1-12a and this task, fixtures/), read line by line.
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FIXTURES } from './__fixtures__/agy.ts';
import { createStreamReader } from './stream.ts';

function readAll(name: string) {
  const reader = createStreamReader();
  const signals = readFileSync(path.join(FIXTURES, name), 'utf8')
    .split('\n')
    .flatMap((line) => reader.read(line));
  return { state: reader.state, signals };
}

const WS = 'C:\\Users\\elvaria\\AppData\\Local\\Temp\\elvaria-spike\\ws repo\\.elvaria\\worktrees\\q1';

describe('the stream reader on recorded runs', () => {
  it.each([
    ['stream-minimal.jsonl', '2ac644c0-0dfb-461d-9fdc-a5fa5f1d5d9c', 7087, 1],
    ['stream-full-run.jsonl', '32a0acb0-1790-48c1-b110-39fb5d66ed0f', 75_394, 9],
    ['stream-denials.jsonl', '95813669-e383-4ad0-97b9-39a7bba90494', 49_252, 6],
    ['stream-print-timeout.jsonl', 'c98a2039-b2b9-4dc1-9c4e-bc3144de0029', 15_497, 2],
  ])('%s: session, tokens of its steps, model turns', (name, session, tokens, turns) => {
    expect(readAll(name).state).toMatchObject({ session, tokens, turns });
  });

  it('counts the tokens of the steps it saw, not the whole resumed conversation', () => {
    const first = readAll('stream-resume-first.jsonl').state;
    const second = readAll('stream-resume-second.jsonl').state;
    expect(second.session).toBe(first.session);
    // result.usage of the second run says 14 399: both runs together.
    expect([first.tokens, second.tokens]).toEqual([7083, 7316]);
  });

  it('lists the refusals of the hook and of the settings, with what was refused', () => {
    const { state, signals } = readAll('stream-denials.jsonl');
    expect(state.denials).toEqual([
      { tool: 'run_command', detail: 'node -v' },
      { tool: 'write_file', detail: `${WS}\\secret\\b.txt` },
      { tool: 'read_file', detail: `${WS}\\.env` },
    ]);
    expect(signals.find(({ kind }) => kind === 'tool_blocked')).toEqual({
      kind: 'tool_blocked',
      tool: 'run_command',
      reason: 'tool call denied by pre-tool hook: spike: hook deny vs settings allow',
    });
  });

  it('reads a soft-deny from the result, and a denied sub-agent from its empty step', () => {
    expect(readAll('stream-soft-deny-ends-run.jsonl').state.denials).toEqual([
      { tool: 'run_command', detail: 'git status' },
      { tool: 'RunCommand', detail: 'command' },
    ]);
    expect(readAll('stream-subagent-denied.jsonl').state.denials).toEqual([
      { tool: 'invoke_subagent', detail: 'invoke_subagent' },
    ]);
  });

  it("ignores a sub-agent's failure that is not a refusal", () => {
    // send_message failed with `cross-project messaging is not allowed`: an error, not a permission.
    expect(readAll('stream-subagent-failed.jsonl').state.denials.map(({ detail }) => detail)).toEqual([
      'git branch',
      expect.stringMatching(/transcript\.jsonl$/) as unknown,
    ]);
  });

  it('keeps the structured answer and says what the model wrote, turn by turn', () => {
    const { state, signals } = readAll('stream-full-run.jsonl');
    expect(state.result?.structured_output).toMatchObject({ verdict: 'pass' });
    const texts = signals.flatMap((signal) => (signal.kind === 'text' ? [signal.text] : []));
    expect(texts[0]).toBe(
      'I have dispatched the subagent to run `node -p 1+1` and am waiting for its response.',
    );
    const usage = signals.flatMap((signal) => (signal.kind === 'usage' ? [signal.tokens] : []));
    expect(usage.at(-1)).toBe(75_394);
    expect(usage).toEqual([...usage].sort((a, b) => a - b));
  });

  it('skips what is not a JSON object, and steps of another conversation', () => {
    const reader = createStreamReader();
    expect(reader.read('jetski: not json')).toEqual([]);
    expect(reader.read('[1, 2]')).toEqual([]);
    reader.read('{"event":"init","conversation_id":"root"}');
    const other = { conversation_id: 'child', step_index: 1, state: 'DONE', step_type: 'agent_response' };
    expect(reader.read(JSON.stringify({ event: 'step_update', step_update: other }))).toEqual([]);
    expect(reader.state).toMatchObject({ session: 'root', turns: 0, tokens: 0 });
  });

  it('counts a turn as begun on its first line, and as done on its DONE line', () => {
    const reader = createStreamReader();
    const response = (state: string) =>
      JSON.stringify({
        event: 'step_update',
        step_update: {
          conversation_id: 'c',
          step_index: 3,
          state,
          step_type: 'agent_response',
          text_delta: 'hi',
        },
      });
    reader.read(response('ACTIVE'));
    reader.read(response('ACTIVE'));
    expect(reader.state).toMatchObject({ started: 1, turns: 0 });
    reader.read(response('DONE'));
    expect(reader.state).toMatchObject({ started: 1, turns: 1 });
  });

  it('falls back to the result usage when no step reported one', () => {
    const reader = createStreamReader();
    reader.read(
      '{"event":"result","result":{"conversation_id":"","status":"ERROR","usage":{"total_tokens":12}}}',
    );
    expect(reader.state).toMatchObject({ session: undefined, tokens: 12, turns: 0 });
  });
});
