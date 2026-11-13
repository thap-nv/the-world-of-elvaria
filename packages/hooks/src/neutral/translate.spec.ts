// The neutral dialect (PS-23): a CLI the hook does not know by name, described by its adapter in policy.json. The
// payload here is flint's, the made-up CLI of apps/cli's fixtures: the event in `kind`, the tool under
// `action.params`, answers `{"verdict": "refuse", "why": …}`. Every written line is read back through EventSchema.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DC1_LAWS } from '../__fixtures__/claude-payloads.ts';
import { tempKingdom } from '../__fixtures__/temp.ts';
import { runHook } from '../run-hook.ts';
import { answerOf, dialectProblem, dialectToolOf } from './dialect.ts';
import type { TempKingdom } from '../__fixtures__/temp.ts';
import type { HookOutcome } from '../run-hook.ts';
import type { HookDialect } from './dialect.ts';

const NOW = Date.parse('2026-11-13T09:00:00Z');
const ASSIGNEE = { ELVARIA_ROLE: 'assignee' };
const KNIGHT = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'];

const FLINT_DIALECT: HookDialect = {
  version: 1,
  event: 'kind',
  events: { session_start: 'begin', pre_tool: 'before_action', post_tool: 'after_action', stop: 'finish' },
  session: 'thread',
  model: 'engine',
  cwd: 'dir',
  tool_name: 'action.name',
  tool_input: 'action.params',
  exit: 'status',
  tools: {
    shell: { kind: 'bash', grants: ['Bash'], command: 'line' },
    open: { kind: 'read', grants: ['Read'], paths: ['file'] },
    save: { kind: 'write', grants: ['Edit', 'Write'], paths: ['file', 'files'] },
    patch: { kind: 'write', grants: ['Edit', 'Write'], patch: 'text' },
    'delegate*': { kind: 'other', refuse: 'subagent' },
    ask_human: { kind: 'other', refuse: 'ask' },
    fetch: { kind: 'web', grants: ['WebFetch'], url: 'address' },
  },
  answers: {
    deny: { verdict: 'refuse', why: '{reason}' },
    stop: { verdict: 'again', why: '{reason}' },
    pass: { verdict: 'go' },
  },
};

let kingdom: TempKingdom;
let policy: string;
beforeEach(async () => {
  kingdom = await tempKingdom();
  policy = path.join(kingdom.runDir, 'policy.json');
});
afterEach(() => kingdom.remove());

async function writePolicy(fields: Record<string, unknown> = {}): Promise<void> {
  const base = { version: 1, laws: DC1_LAWS, tools: KNIGHT, dialect: FLINT_DIALECT };
  await writeFile(policy, JSON.stringify({ ...base, ...fields }), 'utf8');
}

const hook = (stdin: string, argv: string[] = [], env: Record<string, string> = {}): Promise<HookOutcome> =>
  runHook({ stdin, env: kingdom.env(env), argv: ['--policy', policy, ...argv], now: NOW });

const action = (name: string, params: Record<string, unknown>, kind = 'before_action') =>
  JSON.stringify({ kind, thread: 'flint-1', engine: 'swift', dir: 'C:\\plot', action: { name, params } });

const answer = (outcome: HookOutcome): Record<string, string> =>
  JSON.parse(outcome.stdout) as Record<string, string>;

describe('a CLI read through the neutral dialect', () => {
  beforeEach(() => writePolicy());

  it('lets a call nothing stops run, with the dialect answer for it', async () => {
    expect(answer(await hook(action('shell', { line: 'pnpm test' })))).toEqual({ verdict: 'go' });
    expect(answer(await hook(action('open', { file: 'src/a.ts' })))).toEqual({ verdict: 'go' });
  });

  it('refuses a forbidden command and a forbidden path in its own words, and logs the refusal', async () => {
    const push = answer(await hook(action('shell', { line: 'git push origin main' })));
    expect(push.verdict).toBe('refuse');
    expect(push.why).toMatch(/^Elvaria law of this territory: the command matches the forbidden pattern git/);
    const secret = answer(await hook(action('save', { files: ['ok.ts', '.env'] })));
    expect(secret.why).toMatch(/\.env is a forbidden path/);
    const patched = answer(
      await hook(action('patch', { text: '*** Begin Patch\n*** Add File: .env\n+X=1\n' })),
    );
    expect(patched.why).toMatch(/\.env is a forbidden path/);
    const log = await kingdom.log();
    expect(log.issues).toEqual([]);
    expect(log.events.map(({ type, data }) => [type, data.tool])).toEqual([
      ['agent.tool.blocked', 'bash'],
      ['agent.tool.blocked', 'write'],
      ['agent.tool.blocked', 'write'],
    ]);
  });

  it('refuses a tool the class lacks, sub-agents and questions, and a tool the adapter did not declare', async () => {
    await writePolicy({ tools: ['Read', 'Glob', 'Grep'], search_commands: ['git grep', 'git ls-files'] });
    expect(answer(await hook(action('save', { file: 'a.ts' }))).why).toMatch(
      /your class has no Edit or Write/,
    );
    expect(answer(await hook(action('shell', { line: "git grep -n -e 'x'" }))).verdict).toBe('go');
    expect(answer(await hook(action('delegate_task', {}))).why).toMatch(/sub-agents are not allowed/);
    expect(answer(await hook(action('ask_human', {}))).why).toMatch(/Question section/);
    expect(answer(await hook(action('teleport', {}))).why).toMatch(/not one your tribe's adapter declared/);
  });

  it('lets an undeclared tool through when the adapter says so', async () => {
    await writePolicy({
      dialect: { ...FLINT_DIALECT, unknown_tools: 'allow', answers: { deny: { no: '{reason}' } } },
    });
    expect((await hook(action('teleport', {}))).stdout).toBe('');
  });

  it('writes the session start, the tool calls and asks for the letter at the end', async () => {
    const begin = JSON.stringify({ kind: 'begin', thread: 'flint-1', engine: 'swift-high' });
    expect((await hook(begin, [], ASSIGNEE)).stdout).toBe('');
    const after = JSON.stringify({
      kind: 'after_action',
      thread: 'flint-1',
      dir: 'C:\\plot',
      status: 0,
      action: { name: 'save', params: { file: 'C:\\plot\\src\\a.ts' } },
    });
    await hook(after, [], ASSIGNEE);
    const stop = answer(await hook(JSON.stringify({ kind: 'finish', thread: 'flint-1' }), [], ASSIGNEE));
    expect(stop).toEqual({ verdict: 'again', why: expect.stringMatching(/handover\.md/) as unknown });
    const log = await kingdom.log();
    expect(log.issues).toEqual([]);
    expect(log.events.map(({ type, data }) => [type, data])).toEqual([
      ['agent.session.start', { session: 'flint-1', model: 'swift-high' }],
      ['agent.tool', { tool: 'write', path: 'src/a.ts', exit: 0 }],
      ['agent.notification', expect.anything()],
    ]);
  });

  it('holds the session to nothing at the end when the dialect has no stop answer', async () => {
    const { stop: _stop, ...answers } = FLINT_DIALECT.answers;
    await writePolicy({ dialect: { ...FLINT_DIALECT, answers } });
    expect((await hook(JSON.stringify({ kind: 'finish', thread: 'flint-1' }), [], ASSIGNEE)).stdout).toBe('');
  });

  it('takes the event from argv when the dialect says so, and writes nothing for an event it does not name', async () => {
    await writePolicy({ dialect: { ...FLINT_DIALECT, event: 'argv' } });
    const params = JSON.stringify({ action: { name: 'shell', params: { line: 'git push' } } });
    expect(answer(await hook(params, ['before_action'])).verdict).toBe('refuse');
    expect((await hook(params, ['heartbeat'])).stdout).toBe('');
  });

  it('fails closed on an unreadable pre-tool call named by --event, in the dialect words', async () => {
    const refused = answer(await hook('{"kind":', ['--event', 'before_action']));
    expect(refused.verdict).toBe('refuse');
    expect(refused.why).toMatch(/could not read this tool call/);
    expect((await hook('{"kind":', ['--event', 'finish'])).stdout).toBe('');
  });

  it('blocks every file and shell tool when the dialect is malformed, as for any unreadable policy', async () => {
    await writePolicy({ dialect: { ...FLINT_DIALECT, tool_name: '' } });
    const outcome = await hook(action('shell', { line: 'ls' }));
    expect(outcome.stderr).toMatch(/dialect.tool_name is not a string/);
  });
});

describe('dialectProblem', () => {
  it('accepts no dialect and a whole one', () => {
    expect(dialectProblem(undefined)).toBeUndefined();
    expect(dialectProblem(FLINT_DIALECT)).toBeUndefined();
  });

  it.each([
    ['x', 'dialect is not an object'],
    [{ ...FLINT_DIALECT, version: 2 }, 'dialect.version is 2, not 1'],
    [{ ...FLINT_DIALECT, event: 1 }, 'dialect.event is not a string'],
    [{ ...FLINT_DIALECT, cwd: 1 }, 'dialect.cwd is not a string'],
    [{ ...FLINT_DIALECT, events: {} }, 'dialect.events.pre_tool is not a string'],
    [{ ...FLINT_DIALECT, events: { pre_tool: 'a', stop: 3 } }, 'dialect.events.stop is not a string'],
    [{ ...FLINT_DIALECT, tools: [] }, 'dialect.tools is not an object'],
    [{ ...FLINT_DIALECT, tools: { a: 1 } }, 'dialect.tools.a is not an object'],
    [{ ...FLINT_DIALECT, tools: { a: { kind: 'fly' } } }, 'dialect.tools.a.kind is not one of'],
    [
      { ...FLINT_DIALECT, tools: { a: { kind: 'other', refuse: 'x' } } },
      'dialect.tools.a.refuse is not one of',
    ],
    [
      { ...FLINT_DIALECT, tools: { a: { kind: 'other', grants: 'Bash' } } },
      'dialect.tools.a.grants is not a list',
    ],
    [
      { ...FLINT_DIALECT, tools: { a: { kind: 'bash', command: 1 } } },
      'dialect.tools.a.command is not a string',
    ],
    [{ ...FLINT_DIALECT, unknown_tools: 'maybe' }, 'dialect.unknown_tools is not deny or allow'],
    [{ ...FLINT_DIALECT, answers: { deny: 'no' } }, 'dialect.answers.deny is not an object'],
    [{ ...FLINT_DIALECT, answers: { deny: {}, pass: 'go' } }, 'dialect.answers.pass is not an object'],
  ])('names what is wrong with %j', (value, problem) => {
    expect(dialectProblem(value)).toMatch(problem);
  });
});

describe('the dialect helpers', () => {
  it('finds a tool by its exact name before the longest prefix', () => {
    const tools = {
      'mcp*': { kind: 'other' },
      'mcp_fs*': { kind: 'read' },
      mcp_fs_x: { kind: 'write' },
    } as const;
    const dialect = { ...FLINT_DIALECT, tools };
    expect(dialectToolOf(dialect, 'mcp_fs_x')?.kind).toBe('write');
    expect(dialectToolOf(dialect, 'mcp_fs_y')?.kind).toBe('read');
    expect(dialectToolOf(dialect, 'mcp_web')?.kind).toBe('other');
    expect(dialectToolOf(dialect, 'web')).toBeUndefined();
  });

  it('puts the reason into every string of an answer, nested ones too', () => {
    expect(answerOf({ a: ['{reason}!', 2], b: { c: 'x {reason}' } }, 'no')).toEqual({
      a: ['no!', 2],
      b: { c: 'x no' },
    });
  });
});
