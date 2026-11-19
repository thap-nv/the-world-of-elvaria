// A session's stamina in the Steward's hands (PS-28): one `agent.session.usage` line each time a held session's bar
// crosses a notch or its ceiling changes, for an assignee and a judge alike, to the day's log and the quest's journal;
// none once the session is cut, and the session that goes on after a cut (ADR 0030) starts a full bar of its own.
import { sessionStaminaOf } from '@elvaria/domain';
import { openEventLog, openJournal } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';
import type { AgentRunner, RunnerSignal } from '@elvaria/runner-core';

import { plotsOf } from './__fixtures__/cuts.ts';
import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import type { Bench, BenchOptions } from './__fixtures__/kingdom.ts';
import type { Steward, StewardDeps } from './types.ts';

let current: Bench | undefined;
let running: Steward | undefined;

async function open(
  options: BenchOptions = {},
  overrides: (kingdom: Bench) => Partial<StewardDeps> = () => ({}),
) {
  current = await bench(options);
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

const HANGS = { work: { Cut: ['hang', 'hang', 'hang'] as const } };
/** Rank D: 45 minutes, cut at 67.5; a notch of the bar is a tenth of that. */
const NOTCH = 6.75;

async function usageLines(kingdom: Bench) {
  const log = await openEventLog(kingdom.root).read();
  expect(log.issues).toEqual([]);
  return log.events.filter(({ type }) => type === 'agent.session.usage');
}

/** A runner whose sessions report `tokens` at once; `taken` resolves once the Steward's table has read the figure. */
function reporting(fake: AgentRunner, tokens: number) {
  let took: () => void = () => undefined;
  const taken = new Promise<void>((resolve) => {
    took = resolve;
  });
  const runner: AgentRunner = {
    ...fake,
    spawn: async (req) => {
      const session = await fake.spawn(req);
      async function* signals(): AsyncGenerator<RunnerSignal> {
        yield { kind: 'usage', tokens };
        took();
        yield* session.signals;
      }
      return { ...session, signals: signals() };
    },
  };
  return { runner, taken };
}

describe("a held session's stamina", () => {
  it('is written once per notch up to the cut, in the log and the journal, and never after it', async () => {
    const { kingdom, steward } = await open({ plays: HANGS }, (k) => ({ plots: plotsOf(k, true) }));
    await kingdom.command('create_quest', questPayload('Cut'));
    await steward.tick();
    const quest = await kingdom.quest('Cut');
    for (let half = 1; half <= 20; half += 1) {
      kingdom.clock.advance(NOTCH / 2);
      await steward.tick();
    }
    expect((await kingdom.quest('Cut')).status).toBe('returned');
    const lines = await usageLines(kingdom);
    const first = lines[0]?.session;
    expect(lines.map(({ data }) => data.used)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => n * NOTCH));
    expect(lines.every(({ session, quest: id }) => session === first && id === quest.id)).toBe(true);
    expect(lines[9]).toMatchObject({
      actor: { kind: 'steward' },
      attempt: 1,
      data: {
        role: 'assignee',
        measure: 'time',
        used: 67.5,
        limit: 45,
        pct: 150,
        soft_pct: 85,
        hard_pct: 150,
      },
    });
    const journal = await openJournal(kingdom.root, quest.id).read();
    const journaled = journal.events.filter(({ type }) => type === 'agent.session.usage');
    expect(journaled.map(({ id }) => id)).toEqual(lines.map(({ id }) => id));
    // The cut goes on in a fresh session of the same run: a full bar, its own lines, the cut one silent.
    await steward.tick();
    kingdom.clock.advance(NOTCH);
    await steward.tick();
    const after = await usageLines(kingdom);
    expect(after.slice(0, 10)).toEqual(lines);
    expect(after.slice(10).map(({ session, data }) => [session === first, data.used])).toEqual([
      [false, NOTCH],
    ]);
    // The journal alone draws the new session's bar: its quest line names the seat, its notch line the figure. (The
    // fake CLI writes no agent.session.end, which a real runner always does, so `previous` is the domain spec's.)
    const all = (await openJournal(kingdom.root, quest.id).read()).events;
    const bar = sessionStaminaOf(all).get(quest.id);
    expect(bar).toMatchObject({ session: after[10]?.session, role: 'assignee', attempt: 1 });
    expect(bar?.stamina).toMatchObject({ measure: 'time', used: NOTCH, notch: 1, zone: 'ok' });
  });

  it('writes one line for a reading that crossed three notches at once', async () => {
    const { kingdom, steward } = await open({ plays: HANGS });
    await kingdom.command('create_quest', questPayload('Cut'));
    await steward.tick();
    kingdom.clock.advance(NOTCH * 3);
    await steward.tick();
    await steward.tick();
    expect((await usageLines(kingdom)).map(({ data }) => data.used)).toEqual([NOTCH * 3]);
  });

  it('writes a line with the new ceiling and a lower notch when the owner raises max_tokens mid-session', async () => {
    let taken = Promise.resolve();
    const { kingdom, steward } = await open({ plays: HANGS }, (k) => {
      const reported = reporting(k.runners.claude, 300_000);
      taken = reported.taken;
      return { runners: { claude: reported.runner, gemini: k.runners.gemini } };
    });
    await kingdom.command('create_quest', questPayload('Cut'));
    await steward.tick();
    await taken;
    await steward.tick();
    // 300 000 of 480 000 × 150 %: four notches of the way to the cut.
    expect((await usageLines(kingdom)).map(({ data }) => data)).toEqual([
      expect.objectContaining({ measure: 'tokens', used: 300_000, limit: 480_000 }),
    ]);
    const quest = await kingdom.quest('Cut');
    await kingdom.command('edit_quest', {
      quest: quest.id,
      expected_updated_at: quest.updated_at,
      changes: { budget: { max_tokens: 960_000 } },
    });
    await steward.tick();
    const lines = await usageLines(kingdom);
    expect(lines).toHaveLength(2);
    expect(lines[1]?.data).toMatchObject({ measure: 'tokens', used: 300_000, limit: 960_000 });
  });

  it("writes a judge's lines as the verifier's", async () => {
    const hangingJudge = (req: { readonly role: string }) => (req.role === 'verifier' ? 'hang' : 'submit');
    const { kingdom, steward } = await open({ plays: { work: {} } }, (k) => ({
      runners: {
        claude: k.fake({ tribe: 'claude' as never, scenarioOf: hangingJudge }),
        gemini: k.fake({ tribe: 'gemini' as never, scenarioOf: hangingJudge }),
      },
    }));
    await kingdom.command('create_quest', questPayload('Judged'));
    await tickUntil(steward, kingdom.clock, async () => {
      const quest = await kingdom.quest('Judged');
      return quest.status === 'review' && typeof quest.verifier === 'string';
    });
    kingdom.clock.advance(NOTCH * 2);
    await steward.tick();
    const lines = await usageLines(kingdom);
    expect(lines.at(-1)?.data).toMatchObject({
      role: 'verifier',
      measure: 'time',
      used: NOTCH * 2,
      limit: 45,
    });
  });

  it('is not written again by a Steward started after the one that held the session', async () => {
    const { kingdom, steward } = await open({ plays: HANGS });
    await kingdom.command('create_quest', questPayload('Cut'));
    await steward.tick();
    kingdom.clock.advance(NOTCH * 2);
    await steward.tick();
    const before = await usageLines(kingdom);
    expect(before.map(({ data }) => data.used)).toEqual([NOTCH * 2]);
    await steward.stop();
    running = kingdom.steward();
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    await running.tick();
    await running.tick();
    const lines = await usageLines(kingdom);
    expect(lines.filter(({ session }) => session === before[0]?.session)).toHaveLength(1);
  });
});
