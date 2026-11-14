// A judge of a tribe without structured output (implementation-plan §3.14 `prompt_and_parse`, P1-33): the verdict
// schema goes into the system part, the verdict is cut out of the last text and checked as any (judgeVerdictOf); a
// reply that is no verdict is tried once more in `<run_dir>/retry/`, resumed when the tribe can, told what was wrong;
// still none, and the judge leaves without a verdict, toward the stall like any such judge.
import path from 'node:path';

import { TribeIdSchema, verdictIdOf } from '@elvaria/domain';
import { openJournal } from '@elvaria/eventlog';
import { RETRY_DIR, createFakeRunner } from '@elvaria/runner-core';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { readPids } from './sessions/pids.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward, StewardDeps } from './types.ts';
import type { AgentRunner, FakeRunner, RunnerSignal, SpawnRequest } from '@elvaria/runner-core';

let current: Bench | undefined;
let running: Steward | undefined;

async function open(overrides: (kingdom: Bench) => Partial<StewardDeps>) {
  current = await bench();
  running = current.steward(overrides(current));
  expect(await running.start({ loop: false })).toEqual({ ok: true });
  return { kingdom: current, steward: running };
}

afterEach(async () => {
  await running?.stop();
  await current?.remove();
  running = undefined;
  current = undefined;
});

/**
 * A tribe whose CLI has no JSON Schema flag: its judges end their session with `reply(req)` as their last words,
 * each in a process `pidOf(req)` names (0: in process, nothing to record).
 */
function textJudges(
  fake: FakeRunner,
  reply: (req: SpawnRequest) => string,
  spawned: SpawnRequest[],
  resume = true,
  pidOf: (req: SpawnRequest) => number = () => 0,
): AgentRunner {
  return {
    ...fake,
    capabilities: { ...fake.capabilities, structured_output: false, resume },
    spawn: async (req) => {
      spawned.push(req);
      const session = await fake.spawn(req);
      if (req.role !== 'verifier') return session;
      const text = reply(req);
      async function* signals(): AsyncGenerator<RunnerSignal> {
        yield* session.signals;
        yield { kind: 'text', text };
      }
      return { ...session, pid: pidOf(req), signals: signals() };
    },
  };
}

const PASS_TEXT =
  'All checks pass and the diff does what the quest asks.\n```json\n{"result": "pass", "notes": "Read the diff; every check passes."}\n```';
const isRetry = (req: SpawnRequest) => path.basename(req.run_dir) === RETRY_DIR;
const judgesOf = (spawned: readonly SpawnRequest[]) => spawned.filter(({ role }) => role === 'verifier');

describe('a judge whose tribe answers in text', () => {
  it('gets the verdict schema in its prompt, and its verdict from its last text', async () => {
    const spawned: SpawnRequest[] = [];
    const { kingdom, steward } = await open((k) => ({
      runners: {
        claude: textJudges(k.fakes.claude, () => PASS_TEXT, spawned),
        gemini: textJudges(k.fakes.gemini, () => PASS_TEXT, spawned),
      },
    }));
    await kingdom.command('create_quest', questPayload('Judged in words'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Judged in words')).status === 'done',
    );
    const [judge, ...more] = judgesOf(spawned);
    expect(more).toEqual([]);
    expect(judge).not.toHaveProperty('structured');
    expect(judge?.prompt.system).toContain('# Reply format');
    expect(judge?.prompt.system).toContain('"fail_kind"');
    const quest = await kingdom.quest('Judged in words');
    expect(quest.attempt_log.map(({ role, outcome }) => [role, outcome])).toEqual([
      ['assignee', 'submitted'],
      ['verifier', 'submitted'],
    ]);
  });

  it('tries a reply that is no verdict once more, resumed and told why, and takes the second', async () => {
    const spawned: SpawnRequest[] = [];
    const reply = (req: SpawnRequest) => (isRetry(req) ? PASS_TEXT : '{"result": "fail", "notes": "Meh."}');
    const { kingdom, steward } = await open((k) => ({
      runners: {
        claude: textJudges(k.fakes.claude, reply, spawned),
        gemini: textJudges(k.fakes.gemini, reply, spawned),
      },
    }));
    await kingdom.command('create_quest', questPayload('Judged twice'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Judged twice')).status === 'done',
    );
    const [first, retry, ...more] = judgesOf(spawned);
    expect(more).toEqual([]);
    expect(retry).toMatchObject({ run_dir: path.join(first!.run_dir, RETRY_DIR) });
    expect(retry?.resume?.session_id).toEqual(expect.any(String));
    // Resumed, it is told only what was wrong: the session still holds the diff.
    expect(retry?.prompt.user).toMatch(/^# Your previous reply\n\nIt could not be used:\n- notes: /);
    expect(retry?.prompt.user).toContain('- fail_kind: ');
    // One verifier session for the quest; its verdict names the session the Steward recorded.
    const quest = await kingdom.quest('Judged twice');
    const judged = quest.attempt_log.filter(({ role }) => role === 'verifier');
    expect(judged.map(({ outcome }) => outcome)).toEqual(['submitted']);
    const verdict = await kingdom.store.verdicts.read(verdictIdOf(quest, 1));
    expect(verdict.ok && verdict.value).toMatchObject({ result: 'pass', session_id: judged[0]?.session_id });
    // The verdict's line names the retry and why it opened (P1-49, (c) of P1-33).
    const { events } = await openJournal(kingdom.root, quest.id).read();
    const done = events.find(({ type }) => type === 'quest.done');
    expect(done?.data).toMatchObject({
      sequels: [
        { session_id: expect.any(String) as unknown, why: expect.stringContaining('notes') as unknown },
      ],
    });
    expect(done?.session).toBe(judged[0]?.session_id);
  });

  it("records the retry's process in .state/sessions.json, so a restart reaps the one the judge runs in (P1-33 (b))", async () => {
    const spawned: SpawnRequest[] = [];
    const [FIRST, RETRY] = [4_000_001, 4_000_002];
    const retryHangs = (tribe: string) =>
      createFakeRunner({
        tribe: TribeIdSchema.parse(tribe),
        scenarioOf: (req) => (isRetry(req) ? 'hang' : 'submit'),
      });
    const pidOf = (req: SpawnRequest) => (isRetry(req) ? RETRY : FIRST);
    const { kingdom, steward } = await open(() => ({
      runners: {
        claude: textJudges(retryHangs('claude'), () => 'Looks fine.', spawned, true, pidOf),
        gemini: textJudges(retryHangs('gemini'), () => 'Looks fine.', spawned, true, pidOf),
      },
    }));
    await kingdom.command('create_quest', questPayload('Judged at length'));
    const recorded = async () => (await readPids(kingdom.root)).map(({ role, pid }) => [role, pid]);
    await tickUntil(steward, kingdom.clock, async () => (await recorded()).some(([, pid]) => pid === RETRY));
    expect(await recorded()).toEqual([['verifier', RETRY]]);
    expect(steward.running()).toBe(1);
  });

  it('tells a judge whose pass has no notes to give them, and takes the retry (P1-40)', async () => {
    const spawned: SpawnRequest[] = [];
    const reply = (req: SpawnRequest) => (isRetry(req) ? PASS_TEXT : '{"result": "pass"}');
    const { kingdom, steward } = await open((k) => ({
      runners: {
        claude: textJudges(k.fakes.claude, reply, spawned),
        gemini: textJudges(k.fakes.gemini, reply, spawned),
      },
    }));
    await kingdom.command('create_quest', questPayload('Judged in silence'));
    const done = async () => (await kingdom.quest('Judged in silence')).status === 'done';
    await tickUntil(steward, kingdom.clock, done);
    const [, retry, ...more] = judgesOf(spawned);
    expect(more).toEqual([]);
    expect(retry?.prompt.user).toContain('- notes: a pass says what the judge checked');
  });

  it('opens a fresh retry with the whole prompt when the tribe cannot resume', async () => {
    const spawned: SpawnRequest[] = [];
    const reply = (req: SpawnRequest) => (isRetry(req) ? PASS_TEXT : 'Looks fine.');
    const { kingdom, steward } = await open((k) => ({
      runners: {
        claude: textJudges(k.fakes.claude, reply, spawned, false),
        gemini: textJudges(k.fakes.gemini, reply, spawned, false),
      },
    }));
    await kingdom.command('create_quest', questPayload('Judged afresh'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Judged afresh')).status === 'done',
    );
    const [first, retry] = judgesOf(spawned);
    expect(retry).not.toHaveProperty('resume');
    expect(retry?.prompt.user.startsWith(first!.prompt.user)).toBe(true);
    expect(retry?.prompt.user).toContain('- (reply): no JSON object in the text');
  });

  it('lets the judge leave without a verdict when the retry is no verdict either, and stalls after two', async () => {
    const spawned: SpawnRequest[] = [];
    const { kingdom, steward } = await open((k) => ({
      runners: {
        claude: textJudges(k.fakes.claude, () => 'I would rather not say.', spawned),
        gemini: textJudges(k.fakes.gemini, () => 'I would rather not say.', spawned),
      },
    }));
    await kingdom.command('create_quest', questPayload('Never said'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Never said')).status === 'infirmary',
    );
    // Two judges, each a session and its retry; then the infirmary, no third judge.
    expect(judgesOf(spawned).map(isRetry)).toEqual([false, true, false, true]);
    const quest = await kingdom.quest('Never said');
    expect(quest.attempt_log.filter(({ role }) => role === 'verifier').map(({ outcome }) => outcome)).toEqual(
      ['crash', 'crash'],
    );
    expect(kingdom.notices.at(-1)).toMatchObject({
      trip: 'no_verdict',
      reason: {
        code: 'judge:not_a_verdict',
        params: { stopped: 2, run: 1, error: 'no_verdict: (reply): not a JSON object' },
      },
    });
  });
});
