// spawnParsed (implementation-plan §3.14 `structured_output: prompt_and_parse`, P1-33): the schema in the system part,
// the JSON of the last text as the structured output, and one retry in `<run_dir>/retry/` told what was wrong,
// continuing the first session when the tribe can resume. The caller sees one session throughout.
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { replyRequest, replyRunner, resultCheck } from '../__fixtures__/replies.ts';
import { NO_JSON, RETRY_DIR } from './reply.ts';
import { spawnParsed } from './prompt-and-parse.ts';
import type { Reply } from '../__fixtures__/replies.ts';
import type { RunnerSignal, RunningSession } from '../runner/types.ts';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'elvaria parsed '));
});
afterEach(() => rm(dir, { recursive: true, force: true, maxRetries: 5 }));

async function play(replies: readonly Reply[], resume = true) {
  const runner = replyRunner(replies);
  // Each pid the run names once a retry's process runs (P1-33 (b)): what the Steward records.
  const pids: number[] = [];
  const session = await spawnParsed(runner, replyRequest(dir), {
    check: resultCheck,
    resume,
    spawned: () => pids.push(session.pid),
  });
  return { runner, session, pids };
}

async function signalsOf(session: RunningSession): Promise<RunnerSignal[]> {
  const seen: RunnerSignal[] = [];
  for await (const signal of session.signals) seen.push(signal);
  return seen;
}

describe('spawnParsed', () => {
  it('names the schema in the system part instead of the flag, and reads the JSON of the last text', async () => {
    const { runner, session } = await play([{ text: 'Verdict:\n{"result": "pass"}', tokens: 300 }]);
    const [signals, result] = await Promise.all([signalsOf(session), session.wait()]);
    expect(runner.requests).toHaveLength(1);
    expect(runner.requests[0]).not.toHaveProperty('structured');
    expect(runner.requests[0]?.prompt.system).toMatch(
      /^You judge\.\n\n# Reply format\n\n.*"required":\["result"\]/s,
    );
    expect(runner.requests[0]?.prompt.user).toBe('Judge this diff.');
    expect(result).toMatchObject({ outcome: 'completed', structured: { result: 'pass' }, session_id: 's-1' });
    expect(result).not.toHaveProperty('sequels');
    expect(signals).toEqual([
      { kind: 'usage', tokens: 300 },
      { kind: 'text', text: 'Verdict:\n{"result": "pass"}' },
    ]);
    expect(await session.session_id).toBe('s-1');
  });

  it('tells the caller of no other process when the first reply can be used', async () => {
    const { session, pids } = await play([{ text: '{"result": "pass"}' }]);
    await session.wait();
    expect(pids).toEqual([]);
    expect(session.pid).toBe(1);
  });

  it('tries once more, resumed and told only what was wrong, when the reply cannot be used', async () => {
    const { runner, session, pids } = await play([
      { text: 'Looks fine to me.', tokens: 300, turns: 2 },
      { text: '{"result": "fail"}', tokens: 50, turns: 1 },
    ]);
    const [signals, result] = await Promise.all([signalsOf(session), session.wait()]);
    const retry = runner.requests[1];
    expect(retry).toMatchObject({ run_dir: path.join(dir, RETRY_DIR), resume: { session_id: 's-1' } });
    expect(retry?.prompt.user).toBe(
      `# Your previous reply\n\nIt could not be used:\n- ${NO_JSON}\n\nReply again with the JSON object only.`,
    );
    expect(retry?.prompt.system).toContain('# Reply format');
    expect((await stat(path.join(dir, RETRY_DIR))).isDirectory()).toBe(true);
    // One session for the caller: the first id, the tokens and turns of both, the reply of the second.
    expect(result).toMatchObject({
      structured: { result: 'fail' },
      session_id: 's-1',
      usage: { tokens: 350, turns: 3 },
      duration_ms: 10,
      permission_denials: [
        { tool: 'bash', detail: 's-1' },
        { tool: 'bash', detail: 's-1' },
      ],
      sequels: [{ session_id: 's-1', why: NO_JSON }],
    });
    // The retry's process was named to the caller once it ran: the run's pid is its.
    expect(pids).toEqual([2]);
    // The second session's tokens come on top of the first's, as a running total does.
    expect(signals.filter(({ kind }) => kind === 'usage')).toEqual([
      { kind: 'usage', tokens: 300 },
      { kind: 'usage', tokens: 350 },
    ]);
    expect(session.pid).toBe(2);
  });

  it('opens a fresh retry with the whole prompt when the tribe cannot resume, and gives up after it', async () => {
    const { runner, session } = await play(
      [{ text: '{"result": "maybe"}' }, { text: '{"result": "perhaps"}', tokens: 40 }, { text: '{}' }],
      false,
    );
    const result = await session.wait();
    expect(runner.requests).toHaveLength(2);
    const retry = runner.requests[1];
    expect(retry).not.toHaveProperty('resume');
    expect(retry?.prompt.user).toBe(
      'Judge this diff.\n\n# Your previous reply\n\nIt could not be used:\n- result: pass or fail\n\nReply again with the JSON object only.',
    );
    // What the last text holds, for the caller's own check to refuse.
    expect(result).toMatchObject({ structured: { result: 'perhaps' }, session_id: 's-1' });
    expect(result.sequels).toEqual([{ session_id: 's-2', why: 'result: pass or fail' }]);
    expect(result.usage).toEqual({ tokens: 140 });
  });

  it('does not retry a session that hit a usage limit, ended badly or was killed', async () => {
    for (const reply of [
      { rate_limited: true },
      { outcome: 'error' as const },
      { outcome: 'max_turns' as const },
    ]) {
      const { runner, session } = await play([{ text: 'no', ...reply }]);
      const result = await session.wait();
      expect(runner.requests).toHaveLength(1);
      expect(result).not.toHaveProperty('structured');
    }
    const { runner, session } = await play([{ hang: true, text: 'thinking' }]);
    await session.kill('breaker:time');
    expect(runner.kills).toEqual(['breaker:time']);
    expect(await session.wait()).toMatchObject({ outcome: 'killed' });
    expect(runner.requests).toHaveLength(1);
  });

  it("drops a CLI's own structured output: only the text counts on this road", async () => {
    const { session } = await play([{ text: '{"result": "pass"}', structured: { result: 'fail' } }]);
    expect((await session.wait()).structured).toEqual({ result: 'pass' });
    const none = await play([{ text: 'No.', structured: { result: 'fail' } }, { text: 'Still no.' }]);
    expect(await none.session.wait()).not.toHaveProperty('structured');
  });

  it('ends with what it heard when the retry cannot spawn', async () => {
    const { runner, session } = await play([{ text: 'Not JSON.' }, { throws: true }]);
    const result = await session.wait();
    expect(runner.requests).toHaveLength(2);
    expect(result).toMatchObject({ outcome: 'completed', session_id: 's-1' });
    expect(result).not.toHaveProperty('sequels');
  });

  it('kills a retry that spawns after the run was stopped', async () => {
    const runner = replyRunner([{ text: 'Not JSON.' }, { hang: true }]);
    const spawn = runner.spawn.bind(runner);
    const owner: { cancel?: () => void } = {};
    const slow = {
      ...runner,
      spawn: (req: Parameters<typeof spawn>[0]) => {
        // The owner's cancel lands while the retry is being spawned.
        if (runner.requests.length === 1) owner.cancel?.();
        return spawn(req);
      },
    };
    const session = await spawnParsed(slow, replyRequest(dir), { check: resultCheck, resume: false });
    owner.cancel = () => {
      void session.kill('cancelled');
    };
    const result = await session.wait();
    expect(result.outcome).toBe('killed');
    expect(runner.kills).toEqual(['cancelled', 'the run was stopped']);
  });
});
