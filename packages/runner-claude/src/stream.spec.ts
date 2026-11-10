import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { FIXTURES } from './__fixtures__/harness.ts';
import { parseLine } from './json.ts';
import { outcomeOf, permissionDenialsOf, structuredOf, turnsOf } from './outcome.ts';
import { createStreamReader } from './stream.ts';
import type { Observation } from './stream.ts';

/** Every line of a real run (spike P1-02) through one reader. */
function readFixture(file: string) {
  const reader = createStreamReader();
  const seen: Observation[] = [];
  for (const line of readFileSync(path.join(FIXTURES, file), 'utf8').split(/\r?\n/)) {
    const parsed = parseLine(line);
    if (parsed !== undefined) seen.push(...reader.read(parsed));
  }
  const of = <K extends Observation['kind']>(kind: K) =>
    seen.filter((o): o is Extract<Observation, { kind: K }> => o.kind === kind);
  return { reader, seen, of };
}

describe('stream-json of Claude Code 2.1.318 (fixtures of spike P1-02)', () => {
  it('reads a probe: the session, a completed result and its usage', () => {
    const { reader, of } = readFixture('probe.jsonl');
    expect(reader.session).toBe('70f78c8b-5281-4a07-a3f9-1c0de291d12c');
    expect(of('init')).toHaveLength(1);
    expect(outcomeOf(reader.result, { killed: false })).toBe('completed');
    // input 2, output 4, cache read 4403 counted at a tenth (P1-23)
    expect(reader.tokens).toBe(2 + 4 + 441);
    expect(of('text')).toEqual([{ kind: 'text', text: 'ok' }]);
    expect(reader.rateLimited).toBe(false);
  });

  it.each([
    ['error-max-turns.jsonl', 'max_turns'],
    ['error-max-budget.jsonl', 'budget'],
    // subtype says success; is_error and terminal_reason say otherwise.
    ['error-model-not-found.jsonl', 'error'],
    ['usage-command.jsonl', 'completed'],
  ])('takes the outcome of %s from is_error and terminal_reason', (file, outcome) => {
    expect(outcomeOf(readFixture(file).reader.result, { killed: false })).toBe(outcome);
  });

  it('keeps the last result when background apprentices print several, and every apprentice run', () => {
    const { reader, of } = readFixture('apprentice-max-turns.jsonl');
    expect(reader.result?.origin).toBeDefined();
    expect(turnsOf(reader.result)).toBeGreaterThan(0);
    expect(of('subagent_start')).toEqual([
      { kind: 'subagent_start', agent_type: 'apprentice' },
      { kind: 'subagent_start', agent_type: 'apprentice' },
    ]);
    // Measured from task_notification: SubagentStop does not run at maxTurns (§3.12). Both runs hit maxTurns 2,
    // which only the notification's summary says.
    const cut = { kind: 'subagent_end', agent_type: 'apprentice', stopped: 'max_turns' };
    expect(of('subagent_end')).toEqual([
      { ...cut, duration_ms: 3527 },
      { ...cut, duration_ms: 3501 },
    ]);
  });

  it('leaves `stopped` out for an apprentice that finished on its own', () => {
    const { of } = readFixture('apprentice-background.jsonl');
    const ends = of('subagent_end');
    expect(ends.length).toBeGreaterThan(0);
    expect(ends.every((end) => end.stopped === undefined)).toBe(true);
  });

  it('counts the apprentice model in the usage of the session', () => {
    const { reader, of } = readFixture('apprentice-background.jsonl');
    const usage = of('usage').map((o) => o.tokens);
    expect(usage).toEqual([...usage].sort((a, b) => a - b));
    expect(reader.tokens).toBe(usage.at(-1));
    expect(of('subagent_start').map((o) => o.agent_type)).toContain('apprentice');
  });

  it('names refused tools, by a hook and by a rule, and lists the denials', () => {
    const { reader, of } = readFixture('tools-and-denials.jsonl');
    expect(permissionDenialsOf(reader.result)).toEqual([
      { tool: 'Bash', detail: 'git push origin HEAD' },
      {
        tool: 'Read',
        detail: String.raw`C:\Users\user\spike\Tool - Spike\demo\.elvaria\worktrees\q-inrepo\.env`,
      },
      { tool: 'Bash', detail: 'git -C . push origin HEAD' },
    ]);
    expect(of('tool_blocked').map((o) => o.tool)).toEqual(['Bash', 'Read', 'Bash']);
    expect(readFixture('hook-deny-json.jsonl').of('tool_blocked')).toEqual([
      {
        kind: 'tool_blocked',
        tool: 'Bash',
        reason: 'PreToolUse:Bash hook error: git push is forbidden in this territory (Elvaria policy).',
      },
    ]);
    expect(readFixture('bash-read-denied.jsonl').of('tool_blocked')).toEqual([
      {
        kind: 'tool_blocked',
        tool: 'Bash',
        reason: 'Permission to use Bash with command cat .env has been denied.',
      },
    ]);
  });

  it('has no result for a killed run, only the usage of its assistant lines', () => {
    const { reader } = readFixture('killed.jsonl');
    expect(reader.result).toBeUndefined();
    // input 2, cache write 1789, output 7, cache read 2895 at a tenth
    expect(reader.tokens).toBe(2 + 1789 + 7 + 290);
    expect(outcomeOf(reader.result, { killed: true })).toBe('killed');
    expect(outcomeOf(reader.result, { killed: false })).toBe('error');
  });

  it('sees no rate limit in an allowed rate_limit_event', () => {
    for (const file of [
      'agent-denied-by-hook.jsonl',
      'agent-denied-by-rule.jsonl',
      'dontask-mode-denials.jsonl',
    ]) {
      expect(readFixture(file).reader.rateLimited).toBe(false);
    }
  });

  it("passes on the account's windows of a rate_limit_event, for the mana gauge (P1-05)", () => {
    const { seen } = readFixture('agent-denied-by-hook.jsonl');
    expect(seen.filter(({ kind }) => kind === 'mana')).toEqual([
      {
        kind: 'mana',
        windows: [
          { window: 'five_hour', used_pct: 1, resets_at: '2026-11-06T19:50:00.000Z' },
          { window: 'weekly', used_pct: 55, resets_at: '2026-11-08T13:00:00.000Z' },
        ],
      },
    ]);
  });
});

describe('lines without a real fixture yet (429 comes with P1-16; self-built from the docs)', () => {
  const read = (lines: readonly Record<string, unknown>[]) => {
    const reader = createStreamReader();
    return { reader, seen: lines.flatMap((line) => reader.read(line)) };
  };

  it('turns a rate-limit retry, a rejected rate_limit_event and a 429 result into a rate limit', () => {
    const retry = read([{ type: 'system', subtype: 'api_retry', error: 'rate_limit', error_status: 429 }]);
    expect(retry.seen).toEqual([
      { kind: 'api_retry', error: 'rate_limit', detail: 'API retry (rate_limit, 429)' },
    ]);
    expect(retry.reader.rateLimited).toBe(true);
    // The window the rejection names is spent until its reset, in place of its figure (P1-48).
    const rejected = read([
      {
        type: 'rate_limit_event',
        rate_limit_info: {
          status: 'rejected',
          resetsAt: 1794142800,
          rateLimitType: 'seven_day',
          unifiedWindows: {
            five_hour: { utilization: 0.31, resetsAt: 1793976600 },
            seven_day: { utilization: 0.99, resetsAt: 1794142800 },
          },
        },
      },
    ]);
    const week = '2026-11-08T13:00:00.000Z';
    expect(rejected.seen).toEqual([
      {
        kind: 'mana',
        windows: [
          { window: 'five_hour', used_pct: 31, resets_at: '2026-11-06T14:50:00.000Z' },
          { window: 'weekly', used_pct: 100, resets_at: week },
        ],
      },
      { kind: 'rate_limit', detail: 'usage limit reached (seven_day)', resets_at: week },
    ]);
    expect(read([{ type: 'result', is_error: true, api_error_status: 429 }]).reader.rateLimited).toBe(true);
  });

  it('keeps other retries apart from a rate limit, and reads structured output', () => {
    const overloaded = read([{ type: 'system', subtype: 'api_retry', error: 'overloaded' }]);
    expect(overloaded.seen).toEqual([
      { kind: 'api_retry', error: 'overloaded', detail: 'API retry (overloaded)' },
    ]);
    expect(overloaded.reader.rateLimited).toBe(false);
    expect(structuredOf({ structured_output: { verdict: 'pass' } })).toEqual({ verdict: 'pass' });
  });

  it('ignores lines it does not know, a second init, and tasks that are not apprentices', () => {
    const { reader, seen } = read([
      { type: 'system', subtype: 'init', session_id: 'a' },
      { type: 'system', subtype: 'init', session_id: 'b' },
      { type: 'system', subtype: 'task_started', task_id: 't', run_id: 'r' },
      { type: 'system', subtype: 'task_notification', task_id: 't', run_id: 'r' },
      { type: 'stream_event' },
      { type: 'user', message: { content: 'plain text' } },
    ]);
    expect(seen).toEqual([{ kind: 'init', session: 'a' }]);
    expect(reader.session).toBe('a');
  });

  it('reads a refusal whose content is a list of blocks, of a tool it never saw called', () => {
    const { seen } = read([
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'x', content: [{ type: 'text', text: 'no' }] }],
        },
        tool_result_meta: [{ id: 'x', permission_decision: { decision: 'reject' } }],
      },
    ]);
    expect(seen).toEqual([{ kind: 'tool_blocked', tool: 'unknown', reason: 'no' }]);
  });

  it('counts cache reads at a tenth, so a verifier the size of phase 1 stays under the default 240 000', () => {
    // Report §5.2: ~660k read from the cache, 87k written; counted in full, the breaker cut such sessions twice.
    const message = (id: string, usage: Record<string, number>) => ({
      type: 'assistant',
      message: { id, content: [], usage },
    });
    const { reader, seen } = read([
      message('m1', { input_tokens: 3, output_tokens: 900, cache_creation_input_tokens: 40_000 }),
      message('m2', { input_tokens: 2, output_tokens: 8_095, cache_read_input_tokens: 660_000 }),
      message('m2', { input_tokens: 2, output_tokens: 8_095, cache_read_input_tokens: 660_000 }),
      {
        type: 'result',
        modelUsage: {
          'claude-opus-5-5': {
            inputTokens: 5,
            outputTokens: 8_995,
            cacheCreationInputTokens: 87_000,
            cacheReadInputTokens: 660_000,
          },
          'claude-haiku-5-5': { inputTokens: 1, outputTokens: 4, cacheReadInputTokens: 9 },
        },
      },
    ]);
    expect(seen.filter(({ kind }) => kind === 'usage')).toEqual([
      { kind: 'usage', tokens: 40_903 },
      { kind: 'usage', tokens: 40_903 + 8_097 + 66_000 },
      { kind: 'usage', tokens: 5 + 8_995 + 87_000 + 1 + 4 + 66_001 },
    ]);
    expect(reader.tokens).toBe(162_006);
    expect(reader.tokens).toBeLessThan(240_000);
  });
});
