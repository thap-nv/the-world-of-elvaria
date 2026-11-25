// The session of a CLI that streams JSON lines (Codex, agy; AH-09) against a Node child that plays one: lines become
// signals, a turn past the budget stops the run, stderr lines reach the adapter, and the end becomes a RunResult and
// `agent.session.end` whatever happened. Each adapter's spec and the conformance suite play it with its fake CLI.
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { tempDir } from '@elvaria/testkit';
import type { TempDir } from '@elvaria/testkit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openJournal } from '@elvaria/eventlog';

import { QUEST, REGISTRY, TERRITORY, THORN } from '../__fixtures__/world.ts';
import { toolPolicyOf } from '../policy/tool-policy.ts';
import { runContextOf } from '../runner/run-context.ts';
import { textOf } from '../stream/json.ts';
import { streamReaderOf } from '../stream/line-reader.ts';
import { startLineSession } from './line-session.ts';
import type { RunResult, RunnerSignal, RunningSession, SpawnRequest } from '../runner/types.ts';
import type { LineEnd, LineSessionStart, LineState, LineVerdict } from './line-session.ts';

/** Prints FAKE_LINES (and stdin, as `{"stdin": …}`), FAKE_ERR on stderr, then exits FAKE_EXIT or, with FAKE_HANG, waits. */
const FAKE_CLI = `
let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  if (input !== '') console.log(JSON.stringify({ stdin: input }));
  for (const line of JSON.parse(process.env.FAKE_LINES ?? '[]')) console.log(line);
  process.stderr.write(process.env.FAKE_ERR ?? '');
  if (process.env.FAKE_HANG === '1') setInterval(() => undefined, 1000);
  else process.exitCode = Number(process.env.FAKE_EXIT ?? '0');
});
`;

const knight = REGISTRY.classes.find(({ id }) => id === 'knight')!;

interface Tally extends LineState {
  session: string | undefined;
  tokens: number;
  turns: number;
  started: number;
  readonly said: string[];
}

/** One turn a `text` line; `session` names the session. */
const testReader = () =>
  streamReaderOf<Tally, Tally>(
    { session: undefined, tokens: 0, turns: 0, started: 0, said: [] },
    (tally, value) => {
      tally.session ??= textOf(value, 'session');
      const text = textOf(value, 'text') ?? textOf(value, 'stdin');
      if (text === undefined) return [];
      tally.started += 1;
      tally.turns += 1;
      tally.tokens += 10;
      tally.said.push(text);
      return [{ kind: 'text', text }];
    },
    (tally) => ({ ...tally, said: [...tally.said] }),
  );

const plainVerdict = ({ exit, stopped }: LineEnd<Tally>): LineVerdict => ({
  outcome: stopped ?? (exit.code === 0 ? 'completed' : 'error'),
  denials: [],
});

let root: string;
let temp: TempDir;
beforeEach(async () => {
  temp = await tempDir('line session');
  root = temp.root;
  await mkdir(path.join(root, 'run'));
});
afterEach(() => temp.remove());

function request(env: Record<string, string>, maxTurns = 5): SpawnRequest {
  return {
    role: 'assignee',
    quest: QUEST,
    character: THORN,
    cwd: root,
    prompt: { system: 's', user: 'u' },
    permissions: toolPolicyOf({ role: 'assignee', characterClass: knight, territory: TERRITORY }),
    budget: { max_turns: maxTurns, max_minutes: 5 },
    env: { ELVARIA_KINGDOM: path.join(root, 'kingdom'), ...env },
    run_dir: path.join(root, 'run'),
  };
}

function start(req: SpawnRequest, parts: Partial<LineSessionStart<Tally>> = {}): RunningSession {
  return startLineSession({
    req,
    ctx: runContextOf(req),
    name: 'test',
    turn: 'a turn',
    program: { file: process.execPath, args: ['-e', FAKE_CLI] },
    args: [],
    env: { ...req.env, SystemRoot: process.env.SystemRoot ?? '' },
    reader: testReader(),
    verdict: plainVerdict,
    ...parts,
  });
}

async function played(session: RunningSession): Promise<{ result: RunResult; signals: RunnerSignal[] }> {
  const signals: RunnerSignal[] = [];
  const read = (async () => {
    for await (const signal of session.signals) signals.push(signal);
  })();
  const result = await session.wait();
  await read;
  return { result, signals };
}

const lines = (...values: unknown[]) => JSON.stringify(values.map((value) => JSON.stringify(value)));
const stderrLog = () => readFile(path.join(root, 'run', 'stderr.log'), 'utf8');

describe('startLineSession', () => {
  it('turns lines into signals, names the session and writes its end', async () => {
    const env = { FAKE_LINES: lines({ session: 's-1' }, { text: 'hello' }, 'not json') };
    const session = start(request(env), { stdin: 'the prompt' });
    const { result, signals } = await played(session);
    expect(await session.session_id).toBe('s-1');
    expect(signals).toEqual([
      { kind: 'text', text: 'the prompt' },
      { kind: 'text', text: 'hello' },
    ]);
    expect(result).toMatchObject({
      outcome: 'completed',
      exit_code: 0,
      usage: { tokens: 20, turns: 2 },
      session_id: 's-1',
      permission_denials: [],
      rate_limited: false,
    });
    expect(result.structured).toBeUndefined();
    const journal = await openJournal(path.join(root, 'kingdom'), QUEST.id).read();
    expect(journal.events.map(({ type, data }) => ({ type, data }))).toEqual([
      { type: 'agent.session.end', data: { outcome: 'completed', usage: { tokens: 20, turns: 2 } } },
    ]);
  });

  it('stops the run once a turn past budget.max_turns begins', async () => {
    const env = { FAKE_LINES: lines({ text: 'one' }, { text: 'two' }, { text: 'three' }), FAKE_HANG: '1' };
    const { result } = await played(start(request(env, 1)));
    expect(result.outcome).toBe('max_turns');
    expect(result.exit_code).toBeNull();
    expect(await stderrLog()).toContain('stopped: a turn past budget.max_turns 1 began');
  });

  it('hands stderr to the adapter line by line, and its verdict to the Steward', async () => {
    const env = { FAKE_ERR: 'noise\nblocked: git push\n', FAKE_EXIT: '1' };
    const verdict = ({ stderr }: LineEnd<Tally>): LineVerdict => ({
      outcome: 'error',
      rate_limit: { detail: 'usage limit', resets_at: '2026-11-24T10:00:00.000Z' },
      structured: { verdict: 'pass' },
      denials: stderr.includes('blocked') ? [{ tool: 'Bash', detail: 'git push' }] : [],
    });
    const stderrLine = (line: string): RunnerSignal[] =>
      line.startsWith('blocked') ? [{ kind: 'tool_blocked', tool: 'Bash', reason: line }] : [];
    const { result, signals } = await played(start(request(env), { stderrLine, verdict }));
    expect(signals).toEqual([
      { kind: 'tool_blocked', tool: 'Bash', reason: 'blocked: git push' },
      { kind: 'rate_limit', detail: 'usage limit', resets_at: '2026-11-24T10:00:00.000Z' },
    ]);
    expect(result).toMatchObject({
      outcome: 'error',
      exit_code: 1,
      structured: { verdict: 'pass' },
      permission_denials: [{ tool: 'Bash', detail: 'git push' }],
      rate_limited: true,
    });
  });

  it('kills a run on request, once, and says why', async () => {
    const session = start(request({ FAKE_LINES: lines({ session: 's-2' }), FAKE_HANG: '1' }));
    expect(await session.session_id).toBe('s-2');
    await session.kill('breaker: turns');
    await session.kill('again');
    const { result } = await played(session);
    expect(result).toMatchObject({ outcome: 'killed', exit_code: null });
    const log = await stderrLog();
    expect(log).toContain('killed: breaker: turns');
    expect(log).not.toContain('killed: again');
  });

  it('reports a CLI that never started under an id of its own', async () => {
    const req = request({});
    const session = start(
      { ...req, env: { PATH: '' } },
      { program: { file: path.join(root, 'no such cli'), args: [] } },
    );
    const { result, signals } = await played(session);
    expect(result.session_id).toMatch(/^test-unstarted-\d+$/);
    expect(await session.session_id).toBe(result.session_id);
    expect(signals).toEqual([
      { kind: 'text', text: expect.stringMatching(/^test did not start: /) as string },
    ]);
    // No kingdom in the env: the end cannot be written, and the run's output says so.
    expect(await stderrLog()).toMatch(/test did not start: [\s\S]*ELVARIA_KINGDOM is not set/);
  });
});
