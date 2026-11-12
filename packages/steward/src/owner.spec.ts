import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import type { Bench, BenchOptions } from './__fixtures__/kingdom.ts';
import type { Steward, StewardDeps } from './types.ts';
import type { AgentRunner } from '@elvaria/runner-core';

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

const JUDGES = [
  { id: 'sable', cls: 'judge', model: 'claude-opus-5-5' },
  { id: 'orin', cls: 'judge', tribe: 'gemini', model: 'gemini-3.8-flash-low' },
] as const;

/** Every assignee session ends at the CLI's turn limit: straight to the infirmary. */
const looping = (runner: AgentRunner): AgentRunner => ({
  ...runner,
  spawn: async (req) => {
    const session = await runner.spawn(req);
    return req.role === 'assignee'
      ? { ...session, wait: async () => ({ ...(await session.wait()), outcome: 'max_turns' as const }) }
      : session;
  },
});

describe("the owner's answers", () => {
  it('keeps an answer in the inbox until the asker is free, then the same attempt goes on', async () => {
    const plays = { work: { 'Asks first': ['ask', 'submit'], 'Keeps kael busy': ['hang'] } } as const;
    const { kingdom, steward } = await open({ cast: [{ id: 'kael', cls: 'knight' }, ...JUDGES], plays });
    await kingdom.command('create_quest', questPayload('Asks first'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Asks first')).status === 'blocked',
    );
    expect(kingdom.notices).toEqual([expect.objectContaining({ kind: 'question' })]);
    await kingdom.command('create_quest', questPayload('Keeps kael busy'));
    await steward.tick();
    const asked = await kingdom.quest('Asks first');
    await kingdom.command('answer', { quest: asked.id, answer: 'Keep the old API one more release.' });
    expect((await steward.tick()).commands).toEqual({ applied: 0, rejected: 0, waiting: 1 });
    await kingdom.command('cancel', { quest: (await kingdom.quest('Keeps kael busy')).id });
    await steward.tick();
    const resumed = await kingdom.quest('Asks first');
    expect(resumed).toMatchObject({
      status: 'working',
      attempts: 1,
      blocked: { answer: 'Keep the old API one more release.' },
    });
    // A fresh session of the same run, whose prompt carries the answer.
    expect(resumed.attempt_log.map(({ n, role }) => [n, role])).toEqual([
      [1, 'assignee'],
      [1, 'assignee'],
    ]);
    expect(kingdom.fakes.claude.requests.at(-1)?.prompt.user).toContain('Keep the old API one more release.');
    expect(await kingdom.store.inbox.read()).toEqual([]);
  });

  it('refuses an answer to a quest that asks nothing', async () => {
    const { kingdom, steward } = await open({ cast: [] });
    await kingdom.command('create_quest', questPayload('A draft', { draft: true, created_by: 'chancellor' }));
    await steward.tick();
    await kingdom.command('answer', { quest: (await kingdom.quest('A draft')).id, answer: 'Yes.' });
    expect((await steward.tick()).commands).toEqual({ applied: 0, rejected: 1, waiting: 0 });
  });

  it('seals with a note, the seal counting three times in the reputation', async () => {
    const { kingdom, steward } = await open();
    await kingdom.command('create_quest', questPayload('Needs the seal', { seal_required: true }));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Needs the seal')).status === 'awaiting_seal',
    );
    await kingdom.command('seal', { quest: (await kingdom.quest('Needs the seal')).id, note: 'Clean work.' });
    await steward.tick();
    expect((await kingdom.quest('Needs the seal')).seal).toMatchObject({ note: 'Clean work.' });
    expect((await kingdom.character('kael')).reputation.window.map(({ by_human }) => by_human)).toEqual([
      false,
      true,
    ]);
  });
});

describe('the infirmary', () => {
  it('opens a quest again on retry, and gives it to someone new on a reassign without a character', async () => {
    const { kingdom, steward } = await open({}, (k) => ({
      runners: { claude: looping(k.fakes.claude), gemini: k.fakes.gemini },
    }));
    await kingdom.command('create_quest', questPayload('Loops', { scope_paths: ['a'] }));
    await kingdom.command('create_quest', questPayload('Loops too', { scope_paths: ['b'] }));
    const sick = async (title: string) => (await kingdom.quest(title)).status === 'infirmary';
    await tickUntil(steward, kingdom.clock, async () => (await sick('Loops')) && (await sick('Loops too')));
    const loops = await kingdom.quest('Loops');
    const too = await kingdom.quest('Loops too');
    await kingdom.command('retry', { quest: loops.id });
    await kingdom.command('reassign', { quest: too.id });
    await steward.tick();
    const reassigned = await kingdom.quest('Loops too');
    expect(reassigned.assignee).not.toBe(too.assignee);
    expect(reassigned.attempts).toBeGreaterThanOrEqual(0);
    expect((await kingdom.quest('Loops')).attempt_log.length).toBeGreaterThan(loops.attempt_log.length);
  });

  it('refuses a reassign without a character when nobody else of the class is free', async () => {
    const { kingdom, steward } = await open({ cast: [{ id: 'kael', cls: 'knight' }, ...JUDGES] }, (k) => ({
      runners: { claude: looping(k.fakes.claude), gemini: k.fakes.gemini },
    }));
    await kingdom.command('create_quest', questPayload('Loops'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await kingdom.quest('Loops')).status === 'infirmary',
    );
    await kingdom.command('reassign', { quest: (await kingdom.quest('Loops')).id });
    expect((await steward.tick()).commands).toEqual({ applied: 0, rejected: 1, waiting: 0 });
  });

  it('refuses a suspended character', async () => {
    const cast = [
      { id: 'kael', cls: 'knight' },
      { id: 'thorn', cls: 'knight', status: 'suspended' },
      ...JUDGES,
    ] as const;
    const { kingdom, steward } = await open({ cast });
    await kingdom.command('create_quest', questPayload('Waits', { depends_on: [], rank: 'S' }));
    await steward.tick();
    await kingdom.command('reassign', { quest: (await kingdom.quest('Waits')).id, character: 'thorn' });
    await steward.tick();
    expect((await kingdom.quest('Waits')).assignee).toBeNull();
  });
});
