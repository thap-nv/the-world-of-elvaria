// The owner's suspend and release (implementation-plan §2.6, P1-26): a suspended character takes no work and lets go
// of what it holds (the assignee's attempt ends returned, a verifier leaves the review, a claim not started opens
// again); released, it is idle and takes work again.
import { openEventLog } from '@elvaria/eventlog';
import { createFakeRunner } from '@elvaria/runner-core';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { folderPlots } from './plots.ts';
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

const JUDGES = [
  { id: 'sable', cls: 'judge', model: 'claude-opus-5-5' },
  { id: 'orin', cls: 'judge', tribe: 'gemini', model: 'gemini-3.8-flash-low' },
] as const;

const lines = async (kingdom: Bench) => (await openEventLog(kingdom.root).read()).events;
const answers = async (kingdom: Bench) =>
  (await lines(kingdom))
    .filter(({ type }) => type.startsWith('command.'))
    .map(({ type, data }) => [type, (data as { reason?: string }).reason]);

describe('suspend and release', () => {
  it('keeps a suspended character from work, and gives it work again once released', async () => {
    const { kingdom, steward } = await open({ cast: [{ id: 'kael', cls: 'knight' }, ...JUDGES] });
    await kingdom.command('suspend', { character: 'kael', reason: 'trial over' });
    await kingdom.command('create_quest', questPayload('Waits for kael'));
    await steward.tick();
    expect(await kingdom.character('kael')).toMatchObject({ status: 'suspended', current: null });
    expect(await kingdom.quest('Waits for kael')).toMatchObject({ status: 'open', assignee: null });
    await steward.tick();
    expect((await kingdom.quest('Waits for kael')).status).toBe('open');
    await kingdom.command('release', { character: 'kael' });
    await steward.tick();
    expect(await kingdom.quest('Waits for kael')).toMatchObject({ status: 'working', assignee: 'kael' });
    const told = (await lines(kingdom)).filter(({ type }) => type.startsWith('character.'));
    expect(told.map(({ type, actor }) => [type, actor])).toEqual([
      ['character.suspend', { kind: 'user' }],
      ['character.release', { kind: 'user' }],
    ]);
  });

  it("ends a working assignee's session as returned, with a WIP commit; the quest waits for it or another", async () => {
    const commits: string[] = [];
    const { kingdom, steward } = await open({ plays: { work: { Hangs: ['hang'] } } }, (k) => ({
      plots: {
        ...folderPlots(k.root),
        commit: (_plot, message) => {
          commits.push(message);
          return Promise.resolve({ status: 'committed', sha: 'abc1234' });
        },
      },
    }));
    await kingdom.command('create_quest', questPayload('Hangs'));
    await steward.tick();
    const started = await kingdom.quest('Hangs');
    const doer = started.assignee ?? '';
    expect(started.status).toBe('working');
    await kingdom.command('suspend', { character: doer });
    await steward.tick();
    const returned = await kingdom.quest('Hangs');
    expect(returned).toMatchObject({ status: 'returned', assignee: doer });
    expect(returned.attempt_log.at(-1)).toMatchObject({ role: 'assignee', outcome: 'returned' });
    expect(commits).toEqual([`chore: wip ${started.id} (suspend)`]);
    expect(steward.running()).toBe(0);
    expect(await kingdom.character(doer)).toMatchObject({ status: 'suspended', current: null });
    // Nobody else takes it on their own, and its assignee is away: it waits.
    kingdom.clock.advance(1);
    await steward.tick();
    expect((await kingdom.quest('Hangs')).status).toBe('returned');
    await kingdom.command('release', { character: doer });
    await steward.tick();
    expect(await kingdom.quest('Hangs')).toMatchObject({ status: 'working', assignee: doer });
  });

  it('lets a suspended verifier leave the review to the next judge', async () => {
    const hangingJudge = (tribe: string) =>
      createFakeRunner({
        tribe: tribe as never,
        scenarioOf: (req) => (req.role === 'verifier' ? 'hang' : 'submit'),
      });
    const { kingdom, steward } = await open({}, () => ({
      runners: { claude: hangingJudge('claude'), gemini: hangingJudge('gemini') },
    }));
    await kingdom.command('create_quest', questPayload('Judged'));
    await tickUntil(steward, kingdom.clock, async () => {
      const quest = await kingdom.quest('Judged');
      return quest.status === 'review' && typeof quest.verifier === 'string';
    });
    const judge = (await kingdom.quest('Judged')).verifier ?? '';
    await kingdom.command('suspend', { character: judge });
    await steward.tick();
    // The review waits for the next judge, whose checks run first, outside the tick (P1-25).
    expect(await kingdom.quest('Judged')).toMatchObject({ status: 'review', verifier: null });
    await tickUntil(
      steward,
      kingdom.clock,
      async () => typeof (await kingdom.quest('Judged')).verifier === 'string',
    );
    const quest = await kingdom.quest('Judged');
    // The other judge (another model) takes the review.
    expect(quest.status).toBe('review');
    expect(quest.verifier).not.toBe(judge);
    expect(quest.attempt_log.find((entry) => entry.character === judge)).toMatchObject({
      role: 'verifier',
      outcome: 'cancelled',
    });
    expect((await kingdom.character(judge)).status).toBe('suspended');
    expect(kingdom.notices).toEqual([]);
  });

  it('opens again a quest the owner gave the character that has not started', async () => {
    const { kingdom, steward } = await open();
    await kingdom.command('create_quest', questPayload('First', { draft: true, created_by: 'chancellor' }));
    await steward.tick();
    const first = await kingdom.quest('First');
    await kingdom.command('create_quest', questPayload('Then', { depends_on: [first.id] }));
    await steward.tick();
    await kingdom.command('reassign', { quest: (await kingdom.quest('Then')).id, character: 'kael' });
    await steward.tick();
    expect(await kingdom.quest('Then')).toMatchObject({ status: 'claimed', assignee: 'kael' });
    await kingdom.command('suspend', { character: 'kael' });
    await steward.tick();
    expect(await kingdom.quest('Then')).toMatchObject({ status: 'open', assignee: null });
  });

  it('refuses a character it does not know, a second suspend and a release of one not suspended', async () => {
    const { kingdom, steward } = await open();
    await kingdom.command('suspend', { character: 'nobody' });
    await kingdom.command('release', { character: 'nobody' });
    await kingdom.command('suspend', { character: 'kael' });
    await kingdom.command('suspend', { character: 'kael' });
    await kingdom.command('release', { character: 'thorn' });
    await steward.tick();
    expect(await answers(kingdom)).toEqual([
      ['command.rejected', 'unknown_character'],
      ['command.rejected', 'unknown_character'],
      ['command.applied', undefined],
      ['command.rejected', 'character_suspended'],
      ['command.rejected', 'not_suspended'],
    ]);
  });
});
