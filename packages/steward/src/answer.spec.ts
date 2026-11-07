// The owner's answer to a character's question (implementation-plan §2.4, ADR 0017, §8 P1-05): within
// dispatch.resume_after_answer_minutes of the question the asking session goes on (--resume), later a fresh one
// starts from the letter; an adapter without resume always starts fresh.
import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil, wakesAfter } from './__fixtures__/kingdom.ts';
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

const typesOf = async (kingdom: Bench) =>
  (await openEventLog(kingdom.root).read()).events.map(({ type }) => type);
const statusOf = async (kingdom: Bench, title: string) => (await kingdom.quest(title)).status;

describe("the owner's answer", () => {
  /** The quest blocked on Kael's question; the clock then moves `minutes` past the question before the answer. */
  async function answeredAfter(minutes: number, overrides?: (kingdom: Bench) => Partial<StewardDeps>) {
    const { kingdom, steward } = await open({ plays: { work: { Asks: ['ask', 'submit'] } } }, overrides);
    await kingdom.command('create_quest', questPayload('Asks'));
    await tickUntil(steward, kingdom.clock, async () => (await statusOf(kingdom, 'Asks')) === 'blocked');
    const asked = (await kingdom.quest('Asks')).attempt_log.at(-1)?.session_id;
    kingdom.clock.advance(minutes);
    await kingdom.command('answer', {
      quest: (await kingdom.quest('Asks')).id,
      answer: 'On the release branch.',
    });
    await steward.tick();
    // The same attempt goes on (the fake session may already have handed in by the end of the tick).
    const quest = await kingdom.quest('Asks');
    const runs = quest.attempt_log.filter(({ role }) => role === 'assignee');
    expect(quest.attempts).toBe(1);
    expect(runs.map(({ n }) => n)).toEqual([1, 1]);
    const requests = kingdom.fakes.claude.requests.filter(({ role }) => role === 'assignee');
    return { asked, resumed: requests.at(-1)?.resume, revived: runs[1] };
  }

  it('continues the asking session for an answer at minute 54', async () => {
    const { asked, resumed, revived } = await answeredAfter(54);
    expect(asked).toBeDefined();
    expect(resumed).toEqual({ session_id: asked });
    expect(revived?.session_id).toBe(asked);
  });

  it('starts a fresh session from the letter for an answer at minute 56', async () => {
    const { asked, resumed, revived } = await answeredAfter(56);
    expect(resumed).toBeUndefined();
    expect(revived?.session_id).not.toBe(asked);
  });

  it('starts a fresh session when the adapter cannot resume', async () => {
    const { resumed } = await answeredAfter(5, (k) => ({
      runners: {
        claude: { ...k.runners.claude, capabilities: { ...k.runners.claude.capabilities, resume: false } },
      },
    }));
    expect(resumed).toBeUndefined();
  });

  it('does not block the quest again on the answered question left in the letter', async () => {
    const { kingdom, steward } = await open({ plays: { work: { 'Asks once': ['ask', 'ask'] } } });
    await kingdom.command('create_quest', questPayload('Asks once'));
    await tickUntil(steward, kingdom.clock, async () => (await statusOf(kingdom, 'Asks once')) === 'blocked');
    await kingdom.command('answer', { quest: (await kingdom.quest('Asks once')).id, answer: 'On main.' });
    await tickUntil(steward, kingdom.clock, async () => (await statusOf(kingdom, 'Asks once')) === 'done');
    expect((await typesOf(kingdom)).filter((type) => type === 'quest.blocked')).toHaveLength(1);
  });

  it('waits while the asker sleeps for mana', async () => {
    const { kingdom, steward } = await open({
      plays: { work: { Asks: ['ask', 'submit'], 'Runs dry': ['rate_limit'] } },
      probes: { claude: wakesAfter(99) },
      cast: [
        { id: 'kael', cls: 'knight', level: 3 },
        { id: 'sable', cls: 'judge', model: 'claude-opus-5-5', level: 6 },
      ],
    });
    await kingdom.command('create_quest', questPayload('Asks'));
    await tickUntil(steward, kingdom.clock, async () => (await statusOf(kingdom, 'Asks')) === 'blocked');
    await kingdom.command('create_quest', questPayload('Runs dry'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await statusOf(kingdom, 'Runs dry')) === 'paused_mana',
    );
    await kingdom.command('answer', { quest: (await kingdom.quest('Asks')).id, answer: 'On main.' });
    const report = await steward.tick();
    expect(report.commands.waiting).toBe(1);
    expect(await statusOf(kingdom, 'Asks')).toBe('blocked');
  });
});
