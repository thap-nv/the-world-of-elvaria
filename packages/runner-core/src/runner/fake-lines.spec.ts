import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { openEventLog, openJournal } from '@elvaria/eventlog';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { RM_TEMP } from '../__fixtures__/temp.ts';
import { QUEST_ID, REGISTRY, TERRITORY, THORN } from '../__fixtures__/world.ts';
import { FAKE_SCENARIO_ENV } from '../conformance/scenarios.ts';
import { toolPolicyOf } from '../policy/tool-policy.ts';
import { FAKE_TOKENS, createFakeRunner } from './fake-runner.ts';
import type { FakeScenario } from '../conformance/scenarios.ts';
import type { RunnerSignal, SpawnRequest } from './types.ts';

/** 2026-11-07 09:00:00 in Ho Chi Minh City. */
const NOW = Date.parse('2026-11-07T02:00:00Z');

let root = '';
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'elvaria fake lines '));
});
afterAll(() => rm(root, RM_TEMP));

const knight = REGISTRY.classes.find((entry) => entry.id === 'knight')!;

/** A request of a quest in `kingdom`, as the Steward makes it: the context of the session is in its env. */
const requestIn = (kingdom: string | undefined, scenario: FakeScenario): SpawnRequest => ({
  role: 'assignee',
  character: THORN,
  territory: TERRITORY,
  cwd: root,
  prompt: { system: 'system', user: 'user' },
  permissions: toolPolicyOf({ role: 'assignee', characterClass: knight, territory: TERRITORY }),
  budget: { max_turns: 10, max_minutes: 5 },
  env: {
    [FAKE_SCENARIO_ENV]: scenario,
    ...(kingdom === undefined ? {} : { ELVARIA_KINGDOM: kingdom }),
    ELVARIA_QUEST: QUEST_ID,
    ELVARIA_ATTEMPT: '1',
    ELVARIA_TZ: 'Asia/Ho_Chi_Minh',
  },
  run_dir: root,
});

const kingdomDir = () => mkdtemp(path.join(root, 'kingdom '));

const signalsOf = async (signals: AsyncIterable<RunnerSignal>) => {
  const read: RunnerSignal[] = [];
  for await (const signal of signals) read.push(signal);
  return read;
};

describe('createFakeRunner with lines', () => {
  it('writes the start line and the end line of a finished session, to the log and the journal', async () => {
    const kingdom = await kingdomDir();
    const runner = createFakeRunner({ lines: { now: () => NOW } });
    const session = await runner.spawn(requestIn(kingdom, 'submit'));
    await Promise.all([session.wait(), signalsOf(session.signals)]);
    const { events } = await openEventLog(kingdom).read();
    expect(events.map(({ type, data }) => [type, data])).toEqual([
      ['agent.session.start', { session: 'fake-claude-1', model: THORN.model }],
      ['agent.session.end', { outcome: 'completed', usage: { tokens: FAKE_TOKENS } }],
    ]);
    expect(events[0]).toMatchObject({
      ts: '2026-11-07T09:00:00+07:00',
      actor: { kind: 'character', id: THORN.id },
      quest: QUEST_ID,
      attempt: 1,
      session: 'fake-claude-1',
    });
    expect((await openJournal(kingdom, QUEST_ID).read()).events).toEqual(events);
  });

  it('writes the end of a session that is killed, once the kill has returned, after its start', async () => {
    const kingdom = await kingdomDir();
    const runner = createFakeRunner({ lines: {} });
    const session = await runner.spawn(requestIn(kingdom, 'hang'));
    await session.kill('test');
    expect((await session.wait()).outcome).toBe('killed');
    const { events } = await openEventLog(kingdom).read();
    expect(events.map(({ type, data }) => [type, data])).toEqual([
      ['agent.session.start', { session: 'fake-claude-1', model: THORN.model }],
      ['agent.session.end', { outcome: 'killed', usage: { tokens: 0 } }],
    ]);
  });

  it('writes the end of a session that crashed with the outcome the runner reports', async () => {
    const kingdom = await kingdomDir();
    const session = await createFakeRunner({ lines: {} }).spawn(requestIn(kingdom, 'crash'));
    await Promise.all([session.wait(), signalsOf(session.signals)]);
    const { events } = await openEventLog(kingdom).read();
    expect(events.map(({ data }) => data.outcome)).toEqual([undefined, 'error']);
  });

  it('writes nothing unless asked: a spec that reads the log sees the Steward’s lines alone', async () => {
    const kingdom = await kingdomDir();
    const session = await createFakeRunner().spawn(requestIn(kingdom, 'submit'));
    await Promise.all([session.wait(), signalsOf(session.signals)]);
    expect((await openEventLog(kingdom).read()).events).toEqual([]);
  });

  it('tells in its signals that a line could not be written, as the real runner notes it', async () => {
    const session = await createFakeRunner({ lines: {} }).spawn(requestIn(undefined, 'submit'));
    const [result, signals] = await Promise.all([session.wait(), signalsOf(session.signals)]);
    expect(result.outcome).toBe('completed');
    expect(signals).toContainEqual({ kind: 'text', text: 'ELVARIA_KINGDOM is not set: nothing written' });
  });
});
