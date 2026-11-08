// The agy branch of the hook (implementation-plan §3.6, §3.7): the stdin agy 1.5.2 really sent in spike P1-12a
// (packages/runner-antigravity/fixtures/hook-stdin-full-run.jsonl, with the event the probe got in argv), and
// constructed calls for the laws, sub-agents and the handover gate. Every line is read back through EventSchema.
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DC1_LAWS } from '../__fixtures__/claude-payloads.ts';
import { tempKingdom } from '../__fixtures__/temp.ts';
import { STOP_BLOCK_LIMIT } from '../handover.ts';
import { runHook } from '../run-hook.ts';
import { argvEvent } from './input.ts';
import { ANTIGRAVITY_HOOK_EVENTS, DEFER_TO_SETTINGS } from './translate.ts';
import type { TempKingdom } from '../__fixtures__/temp.ts';
import type { HookEnv } from '../context.ts';

interface Recorded {
  readonly event: string;
  readonly input: Record<string, unknown>;
}

const RECORDED = new URL('../../../runner-antigravity/fixtures/hook-stdin-full-run.jsonl', import.meta.url);
const CALLS = readFileSync(RECORDED, 'utf8')
  .split('\n')
  .filter((line) => line !== '')
  .map((line) => JSON.parse(line) as Recorded);

const NOW = Date.parse('2026-11-06T15:00:00Z');
const PLOT = 'C:/Users/elvaria/dc1-se-team/.elvaria/worktrees/q_20261106_7k3m2a';
const ROOT = '32a0acb0-1790-48c1-b110-39fb5d66ed0f';

let kingdom: TempKingdom;
let policy: string;
beforeEach(async () => {
  kingdom = await tempKingdom();
  policy = path.join(kingdom.runDir, 'policy.json');
  await writeFile(policy, JSON.stringify({ version: 1, laws: DC1_LAWS }), 'utf8');
});
afterEach(() => kingdom.remove());

const call = (event: string, input: unknown, env: HookEnv = kingdom.env(), now = NOW) =>
  runHook({ stdin: JSON.stringify(input), env, argv: [event, '--policy', policy], now });

const decisionOf = (stdout: string): Record<string, unknown> =>
  stdout === '' ? {} : (JSON.parse(stdout) as Record<string, unknown>);

const toolCall = (name: string, args: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  conversationId: ROOT,
  modelName: 'gemini-3.8-flash-low',
  lastUserInput: 'Do the quest.',
  workspacePaths: [PLOT],
  stepIdx: 2,
  toolCall: { name, args },
  ...extra,
});

describe('argvEvent', () => {
  it('reads the event the agy hook command carries, before or after the policy', () => {
    expect(argvEvent(['PreToolUse', '--policy', 'p.json'])).toBe('PreToolUse');
    expect(argvEvent(['--policy', 'p.json', 'Stop'])).toBe('Stop');
  });

  it('finds none in a Claude hook command', () => {
    expect(argvEvent(['--policy', 'PreToolUse'])).toBeUndefined();
    expect(argvEvent(['--policy=p.json'])).toBeUndefined();
    expect(argvEvent([])).toBeUndefined();
  });

  it('names the four events the runner declares', () => {
    expect(ANTIGRAVITY_HOOK_EVENTS).toEqual(['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop']);
  });
});

describe('the payloads agy 1.5.2 really sent (spike P1-12a, M11)', () => {
  let decisions: Record<string, unknown>[];
  beforeEach(async () => {
    decisions = [];
    for (const [index, { event, input }] of CALLS.entries()) {
      const outcome = await call(event, input, kingdom.env(), NOW + index);
      expect(outcome.stderr).toBe('');
      if (event === 'PreToolUse') decisions.push(decisionOf(outcome.stdout));
      else expect(outcome.stdout).toBe('');
    }
  });

  it('defer every tool to the settings but the sub-agent, which is denied', () => {
    const denied = decisions.filter(({ decision }) => decision === 'deny');
    expect(denied).toEqual([
      {
        decision: 'deny',
        reason: expect.stringMatching(/^Elvaria rule: invoke_subagent: sub-agents/) as unknown,
      },
    ]);
    expect(decisions.filter(({ decision }) => decision !== 'deny')).toEqual(
      decisions.slice(0, -1).map(() => DEFER_TO_SETTINGS),
    );
  });

  it('write one session start, the tools with plot paths, and no tool argument verbatim', async () => {
    const { events, issues } = await kingdom.log();
    expect(issues).toEqual([]);
    const starts = events.filter(({ type }) => type === 'agent.session.start');
    // The sub-agent's own SessionStart (empty lastUserInput) writes nothing.
    expect(starts.map(({ data, session }) => [session, data])).toEqual([
      [ROOT, { session: ROOT, model: 'gemini-3.8-flash-low' }],
    ]);
    const tools = events.filter(({ type }) => type === 'agent.tool').map(({ data }) => data);
    expect(tools.map(({ path }) => path).filter(Boolean)).toEqual(['LAW.md', 'notes/m11.txt']);
    expect(tools.map(({ command }) => command).filter(Boolean)).toEqual(['node -p 6*7', 'node -p 1+1']);
    expect(events.find(({ type }) => type === 'agent.tool.blocked')?.data).toMatchObject({ tool: 'other' });
    // write_file's Content and the prompt in lastUserInput reach the hook; neither reaches the log.
    const text = JSON.stringify(events);
    expect(text).not.toContain('Content');
    expect(text).not.toContain('Do each step once');
  });
});

describe('PreToolUse on agy', () => {
  it.each([
    ['read_file', { Path: `${PLOT.replaceAll('/', '\\')}\\.env` }, /\.env is a forbidden path/],
    ['view_file', { AbsolutePath: `${PLOT}/infra/secrets/key.pem` }, /forbidden path \(infra\/secrets/],
    ['write_to_file', { TargetFile: 'infra\\secrets\\new.pem', Content: 'x' }, /forbidden path/],
    ['run_command', { CommandLine: 'git -C . push origin HEAD' }, /forbidden pattern/],
    ['run_command', { CommandLine: 'Get-Content .env' }, /\.env/],
    // A tool the spike did not meet: any argument whose key names a path is guarded, lists included.
    ['view_files', { FilePaths: ['README.md', 7, '.env.local'] }, /\.env\.local is a forbidden path/],
  ])('denies %s against the laws, with the reason the model reads', async (name, args, reason) => {
    const outcome = await call('PreToolUse', toolCall(name, args));
    const decision = decisionOf(outcome.stdout);
    expect(decision.decision).toBe('deny');
    expect(decision.reason).toMatch(reason);
    expect(decision.reason).toMatch(/^Elvaria law of this territory: /);
    const [line] = (await kingdom.log()).events;
    expect(line).toMatchObject({ type: 'agent.tool.blocked', session: ROOT });
  });

  it('denies every sub-agent tool, laws or not', async () => {
    for (const name of ['invoke_subagent', 'define_subagent', 'browser_subagent']) {
      const outcome = await call('PreToolUse', toolCall(name, { Role: 'helper' }), kingdom.env());
      expect(decisionOf(outcome.stdout)).toMatchObject({ decision: 'deny' });
    }
  });

  it('denies the tools that wait for a person: the question goes in the letter', async () => {
    for (const name of ['ask_question', 'ask_permission', 'ask_custom_permission']) {
      const decision = decisionOf((await call('PreToolUse', toolCall(name, { Question: 'main?' }))).stdout);
      expect(decision).toMatchObject({ decision: 'deny' });
      expect(decision.reason).toMatch(/^Elvaria rule: .*Question section of the handover letter/);
    }
  });

  it('reads and regenerates a read-only file, never writes it by hand; refuses a protected path (P1-24)', async () => {
    const laws = { ...DC1_LAWS, read_only_paths: ['docs/glossary.md'] };
    await writeFile(policy, JSON.stringify({ version: 1, laws, cli_protected_paths: ['.husky/**'] }), 'utf8');
    for (const [name, args] of [
      ['view_file', { AbsolutePath: `${PLOT}/docs/glossary.md` }],
      ['run_command', { CommandLine: 'pnpm docs:gen' }],
    ] as const) {
      expect(decisionOf((await call('PreToolUse', toolCall(name, args))).stdout)).toEqual(DEFER_TO_SETTINGS);
    }
    const hand = decisionOf(
      (await call('PreToolUse', toolCall('write_to_file', { TargetFile: 'docs\\glossary.md' }))).stdout,
    );
    expect(hand).toMatchObject({ decision: 'deny' });
    expect(hand.reason).toMatch(/^Elvaria law of this territory: .*is read-only/);
    const hook = decisionOf(
      (await call('PreToolUse', toolCall('edit_file', { Path: '.husky/pre-push' }))).stdout,
    );
    expect(hook.reason).toMatch(/^Elvaria rule: .*refuses to write/);
  });

  it('guards edit_file, the write tool a model reports under -p', async () => {
    const outcome = await call('PreToolUse', toolCall('edit_file', { Path: 'infra/secrets/a.key' }));
    expect(decisionOf(outcome.stdout)).toMatchObject({ decision: 'deny' });
    const [line] = (await kingdom.log()).events;
    expect(line?.data).toMatchObject({ tool: 'write' });
  });

  it('defers the structured answer and every harmless tool to the settings, never allow', async () => {
    for (const [name, args] of [
      ['finish', { verdict: 'pass' }],
      ['run_command', { CommandLine: 'pnpm test' }],
      ['grep_search', { SearchPath: PLOT, Query: 'TODO' }],
      ['mystery_tool', {}],
    ] as const) {
      expect(decisionOf((await call('PreToolUse', toolCall(name, args))).stdout)).toEqual(DEFER_TO_SETTINGS);
    }
    expect((await kingdom.log()).events).toEqual([]);
  });

  describe('the tools of the class (policy `tools`, P1-10)', () => {
    const KNIGHT = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash', 'Agent'];
    const SCOUT = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch', 'WebSearch'];
    const JUDGE = ['Read', 'Glob', 'Grep', 'Bash'];
    const withTools = (tools: readonly string[]) =>
      writeFile(policy, JSON.stringify({ version: 1, tools, laws: DC1_LAWS }), 'utf8');
    const decide = async (name: string, args: Record<string, unknown> = {}) =>
      decisionOf((await call('PreToolUse', toolCall(name, args))).stdout);

    it('denies search_web to a class without WebSearch, which agy would run with no permission', async () => {
      await withTools(KNIGHT);
      const decision = await decide('search_web', { query: 'vitest coverage' });
      expect(decision).toMatchObject({ decision: 'deny' });
      expect(decision.reason).toMatch(/^Elvaria rule: search_web: your class has no WebSearch;/);
      const [line] = (await kingdom.log()).events;
      expect(line).toMatchObject({ type: 'agent.tool.blocked', data: { tool: 'web' } });
    });

    it('defers search_web to the settings for a class that has WebSearch', async () => {
      await withTools(SCOUT);
      expect(await decide('search_web', { query: 'vitest coverage' })).toEqual(DEFER_TO_SETTINGS);
      expect(await decide('run_command', { CommandLine: 'pnpm test' })).toMatchObject({ decision: 'deny' });
    });

    it('denies a judge every write tool and lets it read, grep and run its checks', async () => {
      await withTools(JUDGE);
      for (const name of ['write_file', 'edit_file', 'replace_file_content', 'notebook_edit']) {
        expect(await decide(name, { Path: 'src/a.ts' })).toMatchObject({ decision: 'deny' });
      }
      for (const name of ['read_file', 'list_dir', 'grep_search', 'find_by_name', 'run_command', 'finish']) {
        expect(await decide(name, { CommandLine: 'pnpm test' })).toEqual(DEFER_TO_SETTINGS);
      }
    });

    it('leaves the class to the settings when the policy names no tools', async () => {
      expect(await decide('search_web', { query: 'x' })).toEqual(DEFER_TO_SETTINGS);
    });
  });

  it('blocks file and shell tools when the policy cannot be read', async () => {
    await writeFile(policy, '{ not json', 'utf8');
    const outcome = await call('PreToolUse', toolCall('run_command', { CommandLine: 'pnpm test' }));
    expect(decisionOf(outcome.stdout)).toMatchObject({ decision: 'deny' });
    expect(decisionOf(outcome.stdout).reason).toMatch(/laws could not be loaded/);
  });

  it('answers nothing to a payload that is not JSON, which agy reads as a block', async () => {
    const outcome = await runHook({ stdin: 'oops', env: kingdom.env(), argv: ['PreToolUse'], now: NOW });
    expect(outcome.stdout).toBe('');
  });
});

describe('Stop on agy: the handover gate', () => {
  const assignee = () => kingdom.env({ ELVARIA_ROLE: 'assignee' });
  const stop = (extra: Record<string, unknown> = {}) => ({
    conversationId: ROOT,
    lastUserInput: 'Do the quest.',
    terminationReason: 'TERMINAL_STEP_TYPE',
    ...extra,
  });

  it('asks for one more turn while the letter is unchanged, then lets the session end', async () => {
    await call('SessionStart', stop(), assignee());
    const answers = [];
    for (let index = 0; index <= STOP_BLOCK_LIMIT; index += 1)
      answers.push(decisionOf((await call('Stop', stop(), assignee(), NOW + index)).stdout));
    expect(answers.slice(0, STOP_BLOCK_LIMIT)).toEqual(
      answers.slice(0, STOP_BLOCK_LIMIT).map(() => ({
        decision: 'continue',
        reason: expect.stringMatching(/update the handover letter/) as unknown,
      })),
    );
    expect(answers.at(-1)).toEqual({});
  });

  it('lets a session that updated its letter end', async () => {
    await call('SessionStart', stop(), assignee());
    await kingdom.writeHandover('## Where I am\n\nDone.\n');
    expect((await call('Stop', stop(), assignee())).stdout).toBe('');
  });

  it("leaves a sub-agent's session alone", async () => {
    expect(await call('Stop', stop({ lastUserInput: '' }), assignee())).toEqual({ stdout: '', stderr: '' });
    expect(await call('SessionStart', stop({ lastUserInput: '' }), assignee())).toEqual({
      stdout: '',
      stderr: '',
    });
    expect((await kingdom.log()).events).toEqual([]);
  });

  it('writes nothing for the events it does not declare', async () => {
    expect(await call('PreInvocation', stop({ invocationNum: 0 }))).toEqual({ stdout: '', stderr: '' });
    expect((await kingdom.log()).events).toEqual([]);
  });
});
