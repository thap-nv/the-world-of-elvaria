// Each of the twelve Claude Code events (cli-facts §1.4) with a fake stdin payload → the drafts it yields
// (implementation-plan §3.6, §3.10). Lines on disk are checked against the schema in run-hook.spec.ts; the
// payloads Claude Code really sent are run in real-payloads.spec.ts.
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
import { brokenLaws, compileLaws } from '../laws.ts';
import { APPRENTICE } from './tool-events.ts';
import { CLAUDE_HOOK_EVENTS, modelSlugOf, snakeIdOf, translateClaude } from './translate.ts';
import type { TempKingdom } from '../__fixtures__/temp.ts';
import type { ClaudeEvent } from '../__fixtures__/claude-payloads.ts';
import type { HookContext } from '../context.ts';
import type { Translation } from '../draft.ts';

let kingdom: TempKingdom;
let ctx: HookContext;
beforeEach(async () => {
  kingdom = await tempKingdom();
  ctx = { ...loadContext(kingdom.env(), []), laws: compileLaws(DC1_LAWS) };
});
afterEach(() => kingdom.remove());

const dataOf = (event: ClaudeEvent, fields = {}) => {
  const result = translateClaude(payload(event, fields), ctx);
  expect(result.drafts).toHaveLength(1);
  return result.drafts[0]?.data;
};

/** The reason of a PreToolUse `deny`, as Claude Code reads it from stdout. */
const denyReason = (result: Translation): string | undefined => {
  const output = result.decision?.hookSpecificOutput as
    { hookEventName: string; permissionDecision: string; permissionDecisionReason: string } | undefined;
  if (output === undefined) return undefined;
  expect(output).toMatchObject({ hookEventName: 'PreToolUse', permissionDecision: 'deny' });
  return output.permissionDecisionReason;
};

describe('translateClaude', () => {
  it('handles exactly the twelve events of cli-facts §1.4', () => {
    expect(CLAUDE_HOOK_EVENTS).toEqual(Object.keys(PAYLOADS));
  });

  it.each(Object.keys(PAYLOADS) as ClaudeEvent[])(
    '%s yields its lines and never stops a verifier',
    (event) => {
      const result = translateClaude(PAYLOADS[event], ctx);
      expect(result.drafts.map(({ type }) => type)).toEqual(EXPECTED_TYPES[event]);
      expect(result.decision).toBeUndefined();
    },
  );

  it('ignores events it does not register and payloads without an event', () => {
    for (const raw of [{ hook_event_name: 'InstructionsLoaded' }, { hook_event_name: 'constructor' }, {}]) {
      expect(translateClaude(raw, ctx)).toEqual({ drafts: [], decision: undefined, problems: [] });
    }
  });

  it('SessionStart: session and model slug, the runner model when the payload has none', () => {
    expect(dataOf('SessionStart')).toEqual({ session: SESSION, model: 'claude-opus-5-5' });
    // Under -p Claude Code sends no model (spike P1-02); the runner passes it.
    ctx = { ...ctx, model: 'claude-sonnet-5-5' };
    expect(dataOf('SessionStart', { model: undefined })).toEqual({
      session: SESSION,
      model: 'claude-sonnet-5-5',
    });
    ctx = { ...ctx, model: undefined };
    expect(dataOf('SessionStart', { model: undefined, session_id: undefined })).toEqual({
      session: 'unknown',
      model: 'unknown',
    });
  });

  it('PostToolUse: kind, path relative to the plot with /, duration', () => {
    expect(dataOf('PostToolUse')).toEqual({ tool: 'write', path: 'apps/api/src/score.ts', duration_ms: 12 });
  });

  it("PostToolUse and PostToolUseFailure: an apprentice's call carries its agent_type (§3.12)", () => {
    const apprentice = { agent_id: 'aaee6abdc785a0997', agent_type: APPRENTICE };
    expect(dataOf('PostToolUse', apprentice)).toEqual({
      tool: 'write',
      path: 'apps/api/src/score.ts',
      duration_ms: 12,
      agent_type: APPRENTICE,
    });
    expect(dataOf('PostToolUseFailure', apprentice)).toMatchObject({ exit: 1, agent_type: APPRENTICE });
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
    expect(dataOf('PostToolUse', grep)).toEqual({ tool: 'search' });
    // Searching and listing read no one file: the metrics count reads by file (PS-21).
    for (const tool_name of ['Glob', 'LS']) {
      expect(
        dataOf('PostToolUse', { tool_name, tool_input: { path: 'src' }, duration_ms: undefined }),
      ).toEqual({
        tool: 'search',
        path: 'src',
      });
    }
    const read = { tool_name: 'Read', tool_input: { file_path: 'D:\\kingdom\\quests\\q\\handover.md' } };
    expect(dataOf('PostToolUse', { ...read, duration_ms: undefined })).toEqual({
      tool: 'read',
      path: 'D:/kingdom/quests/q/handover.md',
    });
    expect(dataOf('PostToolUse', { tool_name: 'TodoWrite', tool_input: {}, duration_ms: undefined })).toEqual(
      { tool: 'other' },
    );
  });

  it('PostToolUseFailure: the exit code of a failed shell call', () => {
    expect(dataOf('PostToolUseFailure')).toEqual({
      tool: 'bash',
      command: 'pnpm --filter @dc1/api test',
      exit: 1,
      duration_ms: 4187,
    });
    const edit = { tool_name: 'Edit', tool_input: { file_path: `${PLOT}\\a.ts` }, error: 'x' };
    expect(dataOf('PostToolUseFailure', edit)).toEqual({ tool: 'write', path: 'a.ts', duration_ms: 4187 });
  });

  it('StopFailure: mana.signal with the error id', () => {
    expect(dataOf('StopFailure')).toEqual({ error: 'rate_limit', source: 'stop_failure' });
    expect(dataOf('StopFailure', { error: undefined })).toEqual({ error: 'unknown', source: 'stop_failure' });
  });

  it('SubagentStart and SubagentStop write nothing: the runner reads sub-agents from the stream', () => {
    for (const event of ['SubagentStart', 'SubagentStop'] as const) {
      const explore = payload(event, { agent_type: 'Explore' });
      expect(translateClaude(explore, ctx)).toEqual({ drafts: [], decision: undefined, problems: [] });
    }
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
    ).toEqual({ notification_type: 'unknown', message: '', title: 'Waiting' });
  });
});

describe('PreToolUse', () => {
  const pre = (tool_name: string, tool_input: Record<string, unknown>) =>
    translateClaude(payload('PreToolUse', { tool_name, tool_input }), ctx);

  it('denies a forbidden path given with backslashes, on stdout, and logs agent.tool.blocked', () => {
    const result = pre('Write', { file_path: `${PLOT}\\.env`, content: 'X=1' });
    expect(denyReason(result)).toMatch(
      /^Elvaria law of this territory: .*\.env is a forbidden path \(\.env\)/,
    );
    expect(result.drafts.map(({ type, data }) => [type, data.tool])).toEqual([
      ['agent.tool.blocked', 'write'],
    ]);
    expect(result.drafts[0]?.data.reason).toMatch(/\.env is a forbidden path/);
  });

  it('denies a forbidden command and a shell read of a forbidden file', () => {
    expect(denyReason(pre('Bash', { command: 'git push origin HEAD' }))).toMatch(/forbidden pattern/);
    expect(denyReason(pre('PowerShell', { command: 'Get-Content .env' }))).toMatch(/forbidden path/);
    expect(denyReason(pre('Grep', { pattern: 'KEY', glob: '.env' }))).toMatch(/forbidden path/);
  });

  it('lets a lawful call through without a line', () => {
    expect(pre('Bash', { command: 'pnpm test' })).toEqual({ drafts: [], decision: undefined, problems: [] });
  });

  it('lets a generated file be read and regenerated, never written by hand (P1-24)', () => {
    ctx = { ...ctx, laws: compileLaws({ ...DC1_LAWS, read_only_paths: ['docs/glossary.md'] }) };
    const page = `${PLOT}\\docs\\glossary.md`;
    for (const [tool, input] of [
      ['Read', { file_path: page }],
      ['Grep', { pattern: 'seal', path: 'docs/glossary.md' }],
      ['Bash', { command: 'pnpm docs:gen' }],
      ['Bash', { command: 'git add docs/glossary.md' }],
    ] as const) {
      expect(pre(tool, input).decision).toBeUndefined();
    }
    for (const [tool, input] of [
      ['Write', { file_path: page, content: '# Glossary' }],
      ['Edit', { file_path: 'docs/glossary.md', old_string: 'a', new_string: 'b' }],
      ['Bash', { command: 'pnpm docs:gen > docs/glossary.md' }],
    ] as const) {
      expect(denyReason(pre(tool, input))).toMatch(
        /^Elvaria law of this territory: .*glossary\.md is read-only \(docs\/glossary\.md\): only the territory's generators write it/,
      );
    }
  });

  it('says first, as a rule, that the CLI refuses a protected path: P1-16 §5.9, .husky/pre-push', () => {
    ctx = { ...ctx, laws: compileLaws(DC1_LAWS, { cliProtected: ['.husky/**', '.npmrc'] }) };
    const hook = `${PLOT}\\.husky\\pre-push`;
    const result = pre('Write', { file_path: hook, content: 'pnpm check\n' });
    expect(denyReason(result)).toMatch(
      /^Elvaria rule: .*pre-push is in a path your CLI refuses to write whatever its rules say \(\.husky\/\*\*\); .*Question section/,
    );
    expect(result.drafts.map(({ type, data }) => [type, data.tool])).toEqual([
      ['agent.tool.blocked', 'write'],
    ]);
    expect(
      denyReason(pre('Edit', { file_path: 'apps/web/.npmrc', old_string: 'a', new_string: 'b' })),
    ).toMatch(/refuses to write/);
    // Reading is the CLI's to allow, and it does.
    expect(pre('Read', { file_path: hook }).decision).toBeUndefined();
  });

  it('denies file and shell tools while the laws are unknown, and nothing else', () => {
    ctx = { ...ctx, laws: brokenLaws('policy x: not found') };
    expect(denyReason(pre('Edit', { file_path: 'a.ts' }))).toMatch(/laws could not be loaded/);
    expect(pre('WebSearch', { query: 'zod' }).decision).toBeUndefined();
  });

  it('lets the apprentice through and denies every other sub-agent, laws or not (§3.12)', () => {
    expect(pre('Agent', { prompt: 'x', subagent_type: APPRENTICE }).decision).toBeUndefined();
    ctx = { ...ctx, laws: brokenLaws('policy x: not found') };
    for (const [tool, input] of [
      ['Agent', { prompt: 'x', subagent_type: 'Explore' }],
      ['Task', { prompt: 'x', subagent_type: 'general-purpose' }],
      ['Agent', { prompt: 'x' }],
    ] as const) {
      const result = pre(tool, input);
      expect(denyReason(result)).toMatch(/^Elvaria rule: .*not allowed; the only sub-agent is apprentice/);
      expect(result.drafts.map(({ type, data }) => [type, data.tool])).toEqual([
        ['agent.tool.blocked', 'other'],
      ]);
    }
  });

  it("lets the character name the apprentice's model up to its own, and refuses a stronger one", () => {
    ctx = { ...ctx, apprenticeModels: ['haiku', 'sonnet'] };
    const asked = (model?: string) => pre('Agent', { prompt: 'x', subagent_type: APPRENTICE, model });
    expect(asked().decision).toBeUndefined();
    expect(asked('sonnet').decision).toBeUndefined();
    const refused = asked('opus');
    expect(denyReason(refused)).toMatch(
      /^Elvaria rule: model opus is not allowed for the apprentice, which runs on haiku, sonnet at most/,
    );
    expect(refused.drafts.map(({ type, data }) => [type, data.tool])).toEqual([
      ['agent.tool.blocked', 'other'],
    ]);
    // A policy without the list (a session before P1-17) does not weigh the model.
    ctx = { ...ctx, apprenticeModels: undefined };
    expect(asked('fable').decision).toBeUndefined();
  });

  it('marks a call the apprentice made that the laws refuse with its agent_type', () => {
    const payloadOf = {
      tool_name: 'Read',
      tool_input: { file_path: `${PLOT}\\.env` },
      agent_type: APPRENTICE,
    };
    const result = translateClaude(payload('PreToolUse', payloadOf), ctx);
    expect(denyReason(result)).toMatch(/forbidden path/);
    expect(result.drafts[0]?.data).toMatchObject({ tool: 'read', agent_type: APPRENTICE });
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
