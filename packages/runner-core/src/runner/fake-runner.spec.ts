import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { TribeIdSchema } from '@elvaria/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { REGISTRY, TERRITORY, THORN } from '../__fixtures__/world.ts';
import { FAKE_FORBIDDEN_COMMAND, FAKE_QUESTION, FAKE_SCENARIO_ENV } from '../conformance/scenarios.ts';
import { toolPolicyOf } from '../policy/tool-policy.ts';
import { FAKE_TOKENS, createFakeRunner } from './fake-runner.ts';
import type { FakeScenario } from '../conformance/scenarios.ts';
import type { RunnerSignal, SpawnRequest } from './types.ts';

let dir = '';
beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'elvaria fake runner '));
});
afterAll(() => rm(dir, RM_TEMP));

const knight = REGISTRY.classes.find((entry) => entry.id === 'knight')!;
const request = (scenario?: FakeScenario, fields: Partial<SpawnRequest> = {}): SpawnRequest => ({
  role: 'assignee',
  character: THORN,
  territory: TERRITORY,
  cwd: dir,
  prompt: { system: 'system', user: 'user' },
  permissions: toolPolicyOf({ role: 'assignee', characterClass: knight, territory: TERRITORY }),
  budget: { max_turns: 10, max_minutes: 5 },
  env: scenario === undefined ? {} : { [FAKE_SCENARIO_ENV]: scenario },
  run_dir: dir,
  handover: path.join(dir, 'quests', 'q', 'handover.md'),
  ...fields,
});

const signalsOf = async (signals: AsyncIterable<RunnerSignal>) => {
  const read: RunnerSignal[] = [];
  for await (const signal of signals) read.push(signal);
  return read;
};

describe('createFakeRunner', () => {
  it('submits by default, writes a letter and reports its tokens', async () => {
    const runner = createFakeRunner();
    const session = await runner.spawn(request());
    const [result, signals] = await Promise.all([session.wait(), signalsOf(session.signals)]);
    expect(result).toMatchObject({
      outcome: 'completed',
      exit_code: 0,
      usage: { tokens: FAKE_TOKENS },
      rate_limited: false,
    });
    expect(result.question).toBeUndefined();
    expect(signals).toContainEqual({ kind: 'usage', tokens: FAKE_TOKENS });
    expect(await readFile(path.join(dir, 'quests', 'q', 'handover.md'), 'utf8')).toContain('## Question');
    expect(runner.requests).toHaveLength(1);
    expect(await session.session_id).toBe('fake-claude-1');
  });

  it('reads the question back from the letter it wrote', async () => {
    const result = await (await createFakeRunner().spawn(request('ask'))).wait();
    expect(result.question).toBe(FAKE_QUESTION);
  });

  it('blocks the push through the policy when it declares a tool gate', async () => {
    const session = await createFakeRunner().spawn(request('forbidden_command'));
    const [result, signals] = await Promise.all([session.wait(), signalsOf(session.signals)]);
    expect(result.permission_denials).toEqual([{ tool: 'Bash', detail: FAKE_FORBIDDEN_COMMAND }]);
    expect(signals).toContainEqual({
      kind: 'tool_blocked',
      tool: 'Bash',
      reason: 'denied by rule Bash(git push:*)',
    });
  });

  it('lets the push run without a gate, and reports no tokens without usage', async () => {
    const runner = createFakeRunner({ capabilities: { tool_gate: false, usage: false } });
    const result = await (await runner.spawn(request('forbidden_command'))).wait();
    expect(result.permission_denials).toEqual([]);
    expect(result.usage.tokens).toBe(0);
  });

  it('crashes, runs out of mana, and hangs until it is killed', async () => {
    const runner = createFakeRunner();
    expect(await (await runner.spawn(request('crash'))).wait()).toMatchObject({
      outcome: 'error',
      exit_code: 1,
    });
    const limited = await runner.spawn(request('rate_limit'));
    const [result, signals] = await Promise.all([limited.wait(), signalsOf(limited.signals)]);
    expect(result).toMatchObject({ outcome: 'error', rate_limited: true, usage: { tokens: 0 } });
    expect(signals.map(({ kind }) => kind)).toEqual(['rate_limit']);
    const hanging = await runner.spawn(request('hang'));
    await hanging.kill('test');
    await hanging.kill('again');
    expect(await hanging.wait()).toMatchObject({ outcome: 'killed', exit_code: null });
  });

  it('keeps a resumed session id, and plays the scenario a test chooses after a delay', async () => {
    const runner = createFakeRunner({
      tribe: TribeIdSchema.parse('gemini'),
      scenarioOf: () => 'crash',
      delay_ms: 5,
      tokens: 7,
    });
    const session = await runner.spawn(request('submit', { resume: { session_id: 'old-session' } }));
    expect(await session.session_id).toBe('old-session');
    expect((await session.wait()).outcome).toBe('error');
    expect(runner.tribe).toBe('gemini');
  });

  it('turns a failure of its own into a crash', async () => {
    const blocker = path.join(dir, 'a-file');
    await writeFile(blocker, 'not a folder');
    const session = await createFakeRunner().spawn(
      request('submit', { handover: path.join(blocker, 'handover.md') }),
    );
    const [result, signals] = await Promise.all([session.wait(), signalsOf(session.signals)]);
    expect(result).toMatchObject({ outcome: 'error', exit_code: 1 });
    expect(signals.at(-1)?.kind).toBe('text');
  });

  it('answers probe and doctor', async () => {
    const runner = createFakeRunner({ probe: { status: 'rate_limited', detail: 'empty' } });
    expect(await runner.probe()).toEqual({ status: 'rate_limited', detail: 'empty' });
    expect(await createFakeRunner().probe()).toEqual({ status: 'ok' });
    const pinged: boolean[] = [];
    const waking = createFakeRunner({
      probe: ({ ping = true }) => {
        pinged.push(ping);
        return { status: pinged.length > 1 ? 'ok' : 'rate_limited' };
      },
    });
    expect(await waking.probe()).toEqual({ status: 'rate_limited' });
    expect(await waking.probe({ ping: false })).toEqual({ status: 'ok' });
    expect(pinged).toEqual([true, false]);
    expect(await runner.doctor()).toMatchObject({ version: '0.0.0-fake', auth_ok: true });
  });
});
