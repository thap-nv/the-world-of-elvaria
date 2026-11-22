import { afterEach, expect, it } from 'vitest';

import { plotsOf, spending, wrapUpFile } from '../__fixtures__/cuts.ts';
import { bench, questPayload, tickUntil } from '../__fixtures__/kingdom.ts';
import type { Bench } from '../__fixtures__/kingdom.ts';
import type { Steward } from '../types.ts';
import type { AgentRunner } from '@elvaria/runner-core';

let kingdom: Bench;
let steward: Steward | undefined;
afterEach(async () => {
  await steward?.stop();
  await kingdom.remove();
  steward = undefined;
});

const reporting = (runner: AgentRunner, turns?: number): AgentRunner => ({
  ...runner,
  spawn: async (request) => {
    const session = await runner.spawn(request);
    return {
      ...session,
      wait: async () => {
        const result = await session.wait();
        return { ...result, usage: { tokens: 100, ...(turns === undefined ? {} : { turns }) } };
      },
    };
  },
});

it.each([undefined, 12])('persists turns for both roles, including zero (%s)', async (turns) => {
  kingdom = await bench();
  const runners = {
    claude: reporting(kingdom.runners.claude, 0),
    gemini: reporting(kingdom.runners.gemini, turns),
  };
  steward = kingdom.steward({ runners });
  expect(await steward.start({ loop: false })).toEqual({ ok: true });
  await kingdom.command('create_quest', questPayload('Measured'));
  await tickUntil(steward, kingdom.clock, async () => (await kingdom.quest('Measured')).status === 'done');
  const entries = (await kingdom.quest('Measured')).attempt_log;
  expect(entries.find(({ role }) => role === 'assignee')).toMatchObject({ tokens: 100, turns: 0 });
  const verifier = entries.find(({ role }) => role === 'verifier');
  if (turns === undefined) expect(verifier).not.toHaveProperty('turns');
  else expect(verifier).toMatchObject({ turns });
});

it('recalibrates soft and hard ceilings each tick and passes the turn cap to the runner', async () => {
  kingdom = await bench({ plays: { work: { Calibrated: ['hang', 'hang'] } } });
  const runners = { claude: spending(kingdom.runners.claude, 700_000), gemini: kingdom.runners.gemini };
  steward = kingdom.steward({
    runners,
    plots: plotsOf(kingdom, true),
  });
  expect(await steward.start({ loop: false })).toEqual({ ok: true });
  await kingdom.command(
    'create_quest',
    questPayload('Calibrated', { rank: 'F', estimate: { tokens: 200_000, minutes: 30 } }),
  );
  await steward.tick();
  const started = await kingdom.quest('Calibrated');
  const sample = {
    ...started,
    title: 'Historical sample',
    status: 'archived' as const,
    attempt_log: started.attempt_log.map((entry) => ({
      ...entry,
      ended_at: entry.started_at,
      tokens: 800_000,
      turns: 20,
    })),
  };
  for (let index = 0; index < 10; index += 1) {
    await kingdom.store.quests.write({ ...sample, id: kingdom.ids.quest() });
  }
  await tickUntil(steward, kingdom.clock, async () => (await wrapUpFile(kingdom, started.id)) !== undefined);
  expect(await wrapUpFile(kingdom, started.id)).toMatchObject({ measure: 'tokens', limit: 800_000 });
  expect((await kingdom.quest('Calibrated')).status).toBe('working');
  // Change the samples on disk while the session runs: the next tick must use the new median.
  const files = await kingdom.quests();
  for (const file of files.filter(({ id }) => id !== started.id)) {
    await kingdom.store.quests.write({
      ...file,
      attempt_log: file.attempt_log.map((entry) => ({ ...entry, tokens: 400_000 })),
    });
  }
  await steward.tick();
  expect((await kingdom.quest('Calibrated')).status).toBe('returned');
  await steward.tick();
  expect(kingdom.requests.at(-1)?.budget.max_turns).toBe(30);
});
