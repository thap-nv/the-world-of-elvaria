// The Codex dialect of the hook (P1-12d): the stdin Codex CLI 0.167.0-alpha.4.1 really gave a hook (spike Codex
// 2026-11-12 §3.4, packages/runner-codex/fixtures/hook-payloads.jsonl), and built calls for what the spike did not
// meet; every written line read back through the domain's EventSchema.
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DC1_LAWS } from '../__fixtures__/claude-payloads.ts';
import { tempKingdom } from '../__fixtures__/temp.ts';
import { runHook } from '../run-hook.ts';
import { codexToolCallOf, patchPathsOf } from './tools.ts';
import type { TempKingdom } from '../__fixtures__/temp.ts';
import type { HookOutcome } from '../run-hook.ts';

const RECORDED = new URL('../../../runner-codex/fixtures/hook-payloads.jsonl', import.meta.url);
const PAYLOADS = readFileSync(RECORDED, 'utf8')
  .split('\n')
  .filter((line) => line !== '')
  .map((line) => JSON.parse(line) as Record<string, unknown>);

const NOW = Date.parse('2026-11-12T12:08:31Z');
const KNIGHT = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'];

let kingdom: TempKingdom;
let policy: string;
beforeEach(async () => {
  kingdom = await tempKingdom();
  policy = path.join(kingdom.runDir, 'policy.json');
});
afterEach(() => kingdom.remove());

async function writePolicy(fields: Record<string, unknown>): Promise<void> {
  const base = {
    version: 1,
    laws: DC1_LAWS,
    cli_protected_paths: ['.git/**'],
    elvaria_protected_paths: ['.git/**'],
  };
  await writeFile(policy, JSON.stringify({ ...base, ...fields }), 'utf8');
}

const argv = (event?: string): string[] => [
  '--policy',
  policy,
  '--dialect',
  'codex',
  ...(event === undefined ? [] : ['--event', event]),
];

const call = (raw: Record<string, unknown>, extra: Record<string, string> = {}): Promise<HookOutcome> =>
  runHook({ stdin: JSON.stringify(raw), env: kingdom.env(extra), argv: argv('PreToolUse'), now: NOW });

const denied = (outcome: HookOutcome): string | undefined => {
  if (outcome.stdout === '') return undefined;
  const decision = JSON.parse(outcome.stdout) as { hookSpecificOutput: Record<string, string> };
  expect(decision.hookSpecificOutput.permissionDecision).toBe('deny');
  return decision.hookSpecificOutput.permissionDecisionReason;
};

const pre = (tool: string, input: Record<string, unknown>) => ({
  session_id: 'codex-session',
  cwd: 'C:\\plot',
  hook_event_name: 'PreToolUse',
  model: 'gpt-6-luna',
  tool_name: tool,
  tool_input: input,
});

describe('the payloads Codex really sent', () => {
  let outcomes: HookOutcome[];
  beforeEach(async () => {
    await writePolicy({ tools: KNIGHT });
    outcomes = [];
    for (const [index, raw] of PAYLOADS.entries()) {
      const stdin = JSON.stringify(raw);
      const env = kingdom.env({ ELVARIA_ROLE: 'assignee' });
      outcomes.push(await runHook({ stdin, env, argv: argv(), now: NOW + index }));
    }
  });

  it('deny git push and the sub-agent, and let the shell and apply_patch run', () => {
    expect(PAYLOADS).toHaveLength(18);
    const decisions = PAYLOADS.flatMap((raw, index) => {
      const outcome = outcomes[index];
      if (raw.hook_event_name !== 'PreToolUse' || outcome === undefined) return [];
      const reason = denied(outcome);
      return reason === undefined ? [] : [[raw.tool_name, reason]];
    });
    expect(decisions).toEqual([
      ['Bash', expect.stringMatching(/matches the forbidden pattern git/) as unknown],
      ['collaborationspawn_agent', expect.stringMatching(/sub-agents are not allowed/) as unknown],
      ['collaborationwait_agent', expect.stringMatching(/sub-agents are not allowed/) as unknown],
    ]);
  });

  it('write valid lines: the session, each tool by its kind, the patched file relative to the plot', async () => {
    const { events, issues } = await kingdom.log();
    expect(issues).toEqual([]);
    const types = events.map(({ type }) => type);
    expect(types[0]).toBe('agent.session.start');
    expect(events[0]?.data).toEqual({ session: '01a1cfa8-d96f-7d43-a539-82b56ccd134b', model: 'gpt-6-luna' });
    const tools = events.filter(({ type }) => type === 'agent.tool').map(({ data }) => data);
    expect(tools).toContainEqual({ tool: 'bash', command: 'git status' });
    expect(tools).toContainEqual({ tool: 'write', path: 'hello.txt', exit: 0 });
    expect(types.filter((type) => type === 'agent.tool.blocked')).toHaveLength(3);
  });

  it('hold the session at its first Stop until the letter is written (ADR 0010)', () => {
    const stops = PAYLOADS.flatMap((raw, index) => (raw.hook_event_name === 'Stop' ? [outcomes[index]] : []));
    expect(stops.map((outcome) => JSON.parse(outcome?.stdout ?? '{}') as Record<string, unknown>)).toEqual([
      { decision: 'block', reason: expect.stringMatching(/handover/) as unknown },
      { decision: 'block', reason: expect.stringMatching(/handover/) as unknown },
    ]);
  });
});

describe('a class against the Codex tools', () => {
  it('lets a class without a shell run only a plain search line of the policy', async () => {
    await writePolicy({
      tools: ['Read', 'Edit', 'Write', 'Glob', 'Grep'],
      search_commands: ['git grep', 'git ls-files'],
    });
    expect(
      denied(await call(pre('Bash', { command: "git grep -h -n -e '^' -- 'README.md'" }))),
    ).toBeUndefined();
    expect(denied(await call(pre('Bash', { command: 'Get-Content README.md' })))).toMatch(
      /your class has no Bash; to search or read the files git tracks, run git grep or git ls-files alone/,
    );
    expect(denied(await call(pre('Bash', { command: 'git grep x; rm -r src' })))).toMatch(/; outside quotes/);
  });

  it('refuses a graphify call that builds or names another graph, whatever the class (PS-21)', async () => {
    await writePolicy({ tools: KNIGHT, graph_commands: ['graphify query', 'graphify affected'] });
    expect(denied(await call(pre('Bash', { command: 'graphify update .' })))).toMatch(
      /graphify update is refused/,
    );
    expect(denied(await call(pre('Bash', { command: "graphify query 'x' --graph D:/g.json" })))).toMatch(
      /--graph is refused/,
    );
    expect(denied(await call(pre('Bash', { command: "graphify affected 'FOCUS_MAX'" })))).toBeUndefined();
  });

  it('refuses git grep options that run a program, whatever the class', async () => {
    await writePolicy({ tools: KNIGHT });
    expect(denied(await call(pre('Bash', { command: 'git grep -Ovim x' })))).toMatch(
      /git grep -O is refused/,
    );
  });

  it('keeps apply_patch to a class with Edit or Write, and out of forbidden and git paths', async () => {
    await writePolicy({ tools: ['Read', 'Glob', 'Grep', 'Bash'] });
    const add = (file: string) => ({ command: `*** Begin Patch\n*** Add File: ${file}\n+x\n*** End Patch` });
    expect(denied(await call(pre('apply_patch', add('notes.md'))))).toMatch(
      /your class has no Edit or Write/,
    );
    await writePolicy({ tools: KNIGHT });
    expect(denied(await call(pre('apply_patch', add('notes.md'))))).toBeUndefined();
    expect(denied(await call(pre('apply_patch', add('infra/secrets/key.pem'))))).toMatch(/forbidden path/);
    expect(denied(await call(pre('apply_patch', add('.git/hooks/pre-push'))))).toMatch(/rule of Elvaria/);
  });

  it('refuses questions to a person, tools no class has, and a picture for a class without Read', async () => {
    await writePolicy({ tools: ['Glob'] });
    expect(denied(await call(pre('request_user_input', { questions: [] })))).toMatch(/nobody answers/);
    expect(denied(await call(pre('mcp__scanner__scan', {})))).toMatch(/no class of Elvaria has this tool/);
    expect(denied(await call(pre('image_gen__imagegen', {})))).toMatch(/no class of Elvaria/);
    expect(denied(await call(pre('view_image', { path: 'a.png' })))).toMatch(/your class has no Read/);
    expect(denied(await call(pre('clock__curr_time', {})))).toBeUndefined();
  });

  it('denies a call it cannot read, in the shape Codex reads', async () => {
    await writePolicy({ tools: KNIGHT });
    const outcome = await runHook({ stdin: '{cut', env: kingdom.env(), argv: argv('PreToolUse'), now: NOW });
    expect(denied(outcome)).toMatch(/could not read this tool call/);
  });
});

describe('codexToolCallOf', () => {
  it('reads every file of a patch, renames included', () => {
    const patch = [
      '*** Begin Patch',
      '*** Update File: src/a.ts',
      '*** Move to: src/b.ts',
      '@@',
      '-x',
      '+y',
      '*** Delete File: old.txt',
      '*** Add File: C:\\plot\\new.txt',
      '+n',
      '*** End Patch',
    ].join('\n');
    expect(patchPathsOf(patch)).toEqual(['src/a.ts', 'src/b.ts', 'old.txt', 'C:\\plot\\new.txt']);
    expect(patchPathsOf(undefined)).toEqual([]);
  });

  it('names the kind of each tool, and no command but the shell', () => {
    expect(codexToolCallOf('Bash', { command: 'ls' })).toMatchObject({ kind: 'bash', command: 'ls' });
    expect(codexToolCallOf('view_image', { path: 'a.png' })).toMatchObject({
      kind: 'read',
      paths: ['a.png'],
    });
    expect(codexToolCallOf('web_fetch', { url: 'https://x.dev' })).toMatchObject({
      kind: 'web',
      url: 'https://x.dev',
    });
    expect(codexToolCallOf('collaborationspawn_agent', {})).toMatchObject({ kind: 'other' });
    expect(codexToolCallOf(42, 'not an object')).toMatchObject({
      kind: 'other',
      paths: [],
      command: undefined,
    });
  });
});
