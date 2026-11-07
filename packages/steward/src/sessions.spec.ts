import { openEventLog } from '@elvaria/eventlog';
import { afterEach, describe, expect, it } from 'vitest';

import { CAST, PASS, bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import type { Bench, BenchOptions } from './__fixtures__/kingdom.ts';
import type { Steward, StewardDeps } from './types.ts';
import type { AgentRunner, RunResult } from '@elvaria/runner-core';

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

const statusOf = async (kingdom: Bench, title: string) => (await kingdom.quest(title)).status;
const typesOf = async (kingdom: Bench) =>
  (await openEventLog(kingdom.root).read()).events.map(({ type }) => type);

/** A runner whose assignee sessions end as `outcome` instead of what the fake played. */
function ending(runner: AgentRunner, change: Partial<RunResult>): AgentRunner {
  return {
    ...runner,
    spawn: async (req) => {
      const session = await runner.spawn(req);
      if (req.role !== 'assignee') return session;
      return { ...session, wait: async () => ({ ...(await session.wait()), ...change }) };
    },
  };
}

describe("the end of an assignee's session", () => {
  it('pauses the quest for mana on a usage limit, the assignee asleep on it', async () => {
    const { kingdom, steward } = await open({ plays: { work: { 'Hits the limit': ['rate_limit'] } } });
    await kingdom.command('create_quest', questPayload('Hits the limit'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await statusOf(kingdom, 'Hits the limit')) === 'paused_mana',
    );
    const quest = await kingdom.quest('Hits the limit');
    expect(quest).toMatchObject({ assignee: 'kael', attempts: 1 });
    expect(quest.attempt_log[0]).toMatchObject({ outcome: 'paused' });
    expect(await kingdom.character('kael')).toMatchObject({
      status: 'sleeping_mana',
      status_before_sleep: 'working',
    });
  });

  it('sends the quest to the infirmary when the CLI hits its turn limit, the character bogged down first', async () => {
    const { kingdom, steward } = await open({}, (k) => ({
      runners: { claude: ending(k.fakes.claude, { outcome: 'max_turns' }), gemini: k.fakes.gemini },
    }));
    await kingdom.command('create_quest', questPayload('Loops forever'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await statusOf(kingdom, 'Loops forever')) === 'infirmary',
    );
    expect((await kingdom.quest('Loops forever')).attempt_log[0]).toMatchObject({ outcome: 'breaker' });
    const types = await typesOf(kingdom);
    expect(types.slice(-2)).toEqual(['character.swamp', 'quest.infirmary']);
    expect(kingdom.notices).toEqual([
      expect.objectContaining({ kind: 'infirmary', reason: 'breaker:turns' }),
    ]);
    expect((await kingdom.character('kael')).status).toBe('idle');
  });

  it('releases a claim whose session could not be spawned', async () => {
    const { kingdom, steward } = await open({}, (k) => ({
      runners: {
        claude: { ...k.fakes.claude, spawn: () => Promise.reject(new Error('claude.exe not found')) },
      },
    }));
    await kingdom.command('create_quest', questPayload('Never starts'));
    await steward.tick();
    expect(await kingdom.quest('Never starts')).toMatchObject({
      status: 'open',
      assignee: null,
      attempts: 0,
    });
    expect((await typesOf(kingdom)).slice(-2)).toEqual(['quest.claimed', 'quest.released']);
    expect(kingdom.warnings.join('\n')).toContain('claude.exe not found');
  });
});

describe("the end of a verifier's session", () => {
  it('lets the next verifier take a review left without a verdict or with a partial one', async () => {
    const partial = { result: 'partial', progress: { checked_until: 'src/api/orders.ts' } };
    const { kingdom, steward } = await open({
      plays: { verdicts: { 'Hard to judge': [{ verdict: 'looks fine' }, partial, PASS] } },
    });
    await kingdom.command('create_quest', questPayload('Hard to judge'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await statusOf(kingdom, 'Hard to judge')) === 'done',
    );
    const quest = await kingdom.quest('Hard to judge');
    expect(quest.attempt_log.filter(({ role }) => role === 'verifier').map(({ outcome }) => outcome)).toEqual(
      ['crash', 'crash', 'submitted'],
    );
    expect((await typesOf(kingdom)).filter((type) => type.startsWith('verdict.'))).toEqual([
      'verdict.partial',
      'verdict.pass',
    ]);
    expect(kingdom.warnings.join('\n')).toContain('no verdict');
  });

  it('raises the level of an assignee whose window has earned it', async () => {
    const cast = CAST.map((member) => (member.id === 'kael' ? { ...member, passes: 9 } : member));
    const { kingdom, steward } = await open({ cast });
    await kingdom.command('create_quest', questPayload('The tenth pass'));
    await tickUntil(
      steward,
      kingdom.clock,
      async () => (await statusOf(kingdom, 'The tenth pass')) === 'done',
    );
    expect(await kingdom.character('kael')).toMatchObject({ level: 4 });
    expect((await kingdom.character('kael')).level_since).toBeDefined();
    expect((await typesOf(kingdom)).at(-1)).toBe('character.level_up');
  });
});
