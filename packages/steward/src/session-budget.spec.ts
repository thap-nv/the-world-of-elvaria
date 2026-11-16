// The budget the runner enforces is the domain's hard ceiling (F): the holder's tribe's turn ceiling (not the
// kingdom's nominal `max_turns`) and the quest's minutes, both at `hard_pct`, for the worker and for the judge, so
// no CLI cuts a session before the Steward's hard cut.
import { ok } from '@elvaria/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import { statusIs } from './__fixtures__/review.ts';
import type { Bench } from './__fixtures__/kingdom.ts';
import type { Steward } from './types.ts';

const benches: Bench[] = [];
const stewards: Steward[] = [];

afterEach(async () => {
  for (const steward of stewards.splice(0)) await steward.stop();
  for (const done of benches.splice(0)) await done.remove();
});

const NOMINAL_TURNS = 200;
const CLAUDE_TURNS = 1000;
const HARD_PCT = 150;

describe('the budget a runner gets', () => {
  it('is the tribe turn ceiling and the quest minutes at hard_pct, for the worker and the judge', async () => {
    const current = await bench({
      cast: [
        { id: 'kael', cls: 'knight' },
        { id: 'orin', cls: 'judge', tribe: 'gemini', model: 'gemini-3.8-flash-low' },
      ],
    });
    benches.push(current);
    const saved = await current.store.kingdom.update((kingdom) =>
      ok({
        ...kingdom,
        breakers: { ...kingdom.breakers, max_turns: NOMINAL_TURNS, hard_pct: HARD_PCT },
        tribes: kingdom.tribes.map((tribe) =>
          tribe.id === 'claude' ? { ...tribe, max_turns: CLAUDE_TURNS } : tribe,
        ),
      }),
    );
    expect(saved.ok).toBe(true);
    const running = current.steward();
    stewards.push(running);
    expect(await running.start({ loop: false })).toEqual({ ok: true });
    await current.command('create_quest', questPayload('Budget words'));
    await tickUntil(running, current.clock, statusIs(current, 'Budget words', 'done'));
    const requestOf = (role: string) => {
      const found = current.requests.find((req) => req.role === role);
      if (found === undefined) throw new Error(`no ${role} request`);
      return found;
    };
    const worker = requestOf('assignee');
    const judge = requestOf('verifier');
    const nominal = worker.quest?.budget.max_minutes ?? 0;
    expect(nominal).toBeGreaterThan(0);
    const minutes = (nominal * HARD_PCT) / 100;
    expect(worker.budget).toEqual({ max_turns: (CLAUDE_TURNS * HARD_PCT) / 100, max_minutes: minutes });
    expect(judge.budget.max_turns).toBe((NOMINAL_TURNS * HARD_PCT) / 100);
    expect(judge.budget.max_minutes).toBe(minutes);
  });
});
