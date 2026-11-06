// Each of the twelve Claude Code events (cli-facts §1.4) with a fake stdin payload → the drafts it yields
// (implementation-plan §3.6, §3.10). Lines on disk are checked against the schema in run-hook.spec.ts.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DC1_LAWS,
  EXPECTED_TYPES,
  PAYLOADS,
  PLOT,
  SESSION,
  payload,
} from '../__fixtures__/claude-payloads.ts';
import { tempKingdom } from '../__fixtures__/temp.ts';
import { loadContext } from '../context.ts';
import { compileLaws } from '../laws.ts';
import { CLAUDE_HOOK_EVENTS, modelSlugOf, snakeIdOf, translateClaude } from './translate.ts';
import type { TempKingdom } from '../__fixtures__/temp.ts';
import type { ClaudeEvent } from '../__fixtures__/claude-payloads.ts';
import type { HookContext } from '../context.ts';

const NOW = Date.parse('2026-11-06T02:12:03Z');

let kingdom: TempKingdom;
let ctx: HookContext;
beforeEach(async () => {
  kingdom = await tempKingdom();
  ctx = { ...loadContext(kingdom.env(), []), laws: compileLaws(DC1_LAWS) };
});
afterEach(() => kingdom.remove());

const dataOf = (event: ClaudeEvent, fields = {}, at = NOW) => {
  const result = translateClaude(payload(event, fields), ctx, at);
  expect(result.drafts).toHaveLength(1);
  return result.drafts[0]?.data;
};

describe('translateClaude', () => {
  it('handles exactly the twelve events of cli-facts §1.4', () => {
    expect(CLAUDE_HOOK_EVENTS).toEqual(Object.keys(PAYLOADS));
  });

  it.each(Object.keys(PAYLOADS) as ClaudeEvent[])(
    '%s yields its lines and never blocks a verifier',
    (event) => {
      const result = translateClaude(PAYLOADS[event], ctx, NOW);
      expect(result.drafts.map(({ type }) => type)).toEqual(EXPECTED_TYPES[event]);
      expect(result.block).toBeUndefined();
    },
  );

  it('ignores events it does not register and payloads without an event', () => {
    for (const raw of [{ hook_event_name: 'UserPromptSubmit' }, { hook_event_name: 'constructor' }, {}]) {
      expect(translateClaude(raw, ctx, NOW)).toEqual({ drafts: [], block: undefined, problems: [] });
    }
  });

  it('SessionStart: session and model slug', () => {
    expect(dataOf('SessionStart')).toEqual({ session: SESSION, model: 'claude-opus-5-5' });
    expect(dataOf('SessionStart', { model: undefined, session_id: undefined })).toEqual({
      session: 'unknown',
      model: 'unknown',
    });
  });

  it('PostToolUse: kind, path relative to the plot with /, duration', () => {
    expect(dataOf('PostToolUse')).toEqual({ tool: 'write', path: 'apps/api/src/score.ts', duration_ms: 12 });
  });

  it('PostToolUse: a shell command, a fetched URL, a search, a path outside the plot', () => {
    const bash = { tool_name: 'Bash', tool_input: { command: 'pnpm test' }, duration_ms: 9.6 };
    expect(dataOf('PostToolUse', bash)).toEqual({ tool: 'bash', command: 'pnpm test', duration_ms: 10 });
    const fetch = { tool_name: 'WebFetch', tool_input: { url: 'https://example.com', prompt: 'x' } };
    expect(dataOf('PostToolUse', { ...fetch, duration_ms: -1 })).toEqual({
      tool: 'web',
      url: 'https://example.com',
    });
    const grep = { tool_name: 'Grep', tool_input: { pattern: 'score' }, duration_ms: undefined };
    expect(dataOf('PostToolUse', grep)).toEqual({ tool: 'read' });
    const read = { tool_name: 'Read', tool_input: { file_path: 'D:\\kingdom\\quests\\q\\handover.md' } };
    expect(dataOf('PostToolUse', { ...read, duration_ms: undefined })).toEqual({
      tool: 'read',
      path: 'D:/kingdom/quests/q/handover.md',
    });
    expect(dataOf('PostToolUse', { tool_name: 'TodoWrite', tool_input: {}, duration_ms: undefined })).toEqual(
      {
        tool: 'other',
      },
    );
  });

  it('PostToolUseFailure: the exit code of a failed shell call', () => {
    expect(dataOf('PostToolUseFailure')).toEqual({
      tool: 'bash',
      command: 'pnpm --filter @dc1/api test',
      exit: 1,
      duration_ms: 4187,
    });
    const edit = {
      tool_name: 'Edit',
      tool_input: { file_path: `${PLOT}\\a.ts` },
      error: 'x',
    };
    expect(dataOf('PostToolUseFailure', edit)).toEqual({ tool: 'write', path: 'a.ts', duration_ms: 4187 });
  });

  it('StopFailure: mana.signal with the error id', () => {
    expect(dataOf('StopFailure')).toEqual({ error: 'rate_limit', source: 'stop_failure' });
    expect(dataOf('StopFailure', { error: undefined })).toEqual({ error: 'unknown', source: 'stop_failure' });
  });

  it('SubagentStart and SubagentStop: the apprentice and how long it ran', () => {
    expect(dataOf('SubagentStart')).toEqual({ agent_type: 'apprentice' });
    expect(dataOf('SubagentStop', {}, NOW + 95_000)).toEqual({
      agent_type: 'apprentice',
      duration_ms: 95_000,
    });
    // The start is forgotten once read; a stop without a start reads 0.
    expect(dataOf('SubagentStop', {}, NOW + 99_000)).toEqual({ agent_type: 'apprentice', duration_ms: 0 });
    expect(dataOf('SubagentStart', { agent_id: '../../x', agent_type: undefined })).toEqual({
      agent_type: 'unknown',
    });
  });

  it('PreCompact and PostCompact: phase and trigger, never the summary', () => {
    expect(dataOf('PreCompact')).toEqual({ phase: 'pre', trigger: 'auto' });
    expect(dataOf('PostCompact', { trigger: undefined })).toEqual({ phase: 'post' });
  });

  it('Notification: type, message and title', () => {
    expect(dataOf('Notification')).toEqual({
      notification_type: 'idle_prompt',
      message: 'Claude is waiting for your input',
    });
    expect(
      dataOf('Notification', { title: 'Waiting', message: undefined, notification_type: undefined }),
    ).toEqual({
      notification_type: 'unknown',
      message: '',
      title: 'Waiting',
    });
  });
});

describe('PreToolUse', () => {
  const pre = (tool_name: string, tool_input: Record<string, unknown>) =>
    translateClaude(payload('PreToolUse', { tool_name, tool_input }), ctx, NOW);

  it('blocks a forbidden path given with backslashes, and logs agent.tool.blocked', () => {
    const result = pre('Write', { file_path: `${PLOT}\\.env`, content: 'X=1' });
    expect(result.block).toMatch(/^Elvaria law of this territory: .*\.env is a forbidden path \(\.env\)/);
    expect(result.drafts.map(({ type, data }) => [type, data.tool])).toEqual([
      ['agent.tool.blocked', 'write'],
    ]);
    expect(result.drafts[0]?.data.reason).toMatch(/\.env is a forbidden path/);
  });

  it('blocks a forbidden command and a shell read of a forbidden file', () => {
    expect(pre('Bash', { command: 'git push origin HEAD' }).block).toMatch(/forbidden pattern/);
    expect(pre('PowerShell', { command: 'Get-Content .env' }).block).toMatch(/forbidden path/);
    expect(pre('Grep', { pattern: 'KEY', glob: '.env' }).block).toMatch(/forbidden path/);
  });

  it('lets a lawful call through without a line', () => {
    expect(pre('Bash', { command: 'pnpm test' })).toEqual({ drafts: [], block: undefined, problems: [] });
  });

  it('blocks file and shell tools while the laws are unknown, and nothing else', () => {
    ctx = { ...ctx, laws: { paths: [], commands: [], broken: 'policy x: not found' } };
    expect(pre('Edit', { file_path: 'a.ts' }).block).toMatch(/laws could not be loaded/);
    expect(pre('WebSearch', { query: 'zod' }).block).toBeUndefined();
  });
});

describe('modelSlugOf and snakeIdOf', () => {
  it.each([
    ['claude-opus-5-5', 'claude-opus-5-5'],
    ['claude-sonnet-4-5[1m]', 'claude-sonnet-4-5'],
    ['Claude-Haiku-5-5', 'claude-haiku-5-5'],
    ['[1m]', 'unknown'],
    [undefined, 'unknown'],
  ])('model %s → %s', (model, slug) => {
    expect(modelSlugOf(model)).toBe(slug);
  });

  it.each([
    ['rate_limit', 'rate_limit'],
    ['authentication-failed', 'authentication_failed'],
    ['429', 'unknown'],
    [undefined, 'unknown'],
  ])('error %s → %s', (error, id) => {
    expect(snakeIdOf(error)).toBe(id);
  });
});
