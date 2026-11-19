// The bell at the reminder mark (PS-28b, TL4): a session past `soft_pct` rings the owner's bell once, an assignee's in
// the tick of its `agent.session.wrap_up` line and a judge's with no line at all, with the ceiling in force, the cut
// and the smallest raise that lifts it. A fresh session after a cut (ADR 0030) rings again when it passes the mark.
import { afterEach, describe, expect, it } from 'vitest';

import { plotsOf, spending, wrapUpLines } from './__fixtures__/cuts.ts';
import { bench, questPayload, tickUntil } from './__fixtures__/kingdom.ts';
import type { Bench, BenchOptions } from './__fixtures__/kingdom.ts';
import type { Notice, Steward, StewardDeps } from './types.ts';

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
/** Rank D: 45 minutes, so the mark is past 38.25 and the cut at 67.5. */
const SOFT = 40;
const HARD = 67.5;
const hangingJudge = (req: { readonly role: string }) => (req.role === 'verifier' ? 'hang' : 'submit');
const bells = (kingdom: Bench): Notice[] => kingdom.notices.filter(({ kind }) => kind === 'wrap_up');

describe('the bell at the reminder mark', () => {
  it("rings once for an assignee's session, in the tick of its wrap_up line, with the minutes to raise", async () => {
    const { kingdom, steward } = await open({ plays: HANGS });
    await kingdom.command('create_quest', questPayload('Cut'));
    await steward.tick();
    const quest = await kingdom.quest('Cut');
    kingdom.clock.advance(SOFT - 5);
    await steward.tick();
    expect(bells(kingdom)).toEqual([]);
    kingdom.clock.advance(5);
    await steward.tick();
    expect(await wrapUpLines(kingdom)).toHaveLength(1);
    expect(bells(kingdom)).toEqual([
      {
        kind: 'wrap_up',
        quest: { id: quest.id, title: 'Cut', rank: 'D' },
        role: 'assignee',
        character: quest.assignee,
        measure: 'time',
        used: SOFT,
        limit: 45,
        cut_at: HARD,
        raise_from: 46,
      },
    ]);
    kingdom.clock.advance(5);
    await steward.tick();
    expect(bells(kingdom)).toHaveLength(1);
  });

  it('names the smallest token budget that lifts the ceiling: above both the ceiling and the creation budget', async () => {
    const { kingdom, steward } = await open({ plays: HANGS }, (k) => ({
      runners: { claude: spending(k.runners.claude, 410_000), gemini: k.runners.gemini },
    }));
    await kingdom.command('create_quest', questPayload('Cut'));
    await tickUntil(steward, kingdom.clock, () => Promise.resolve(bells(kingdom).length > 0));
    // Rank D's share, 240 000 × mana_multiplier 2, is both the ceiling and the budget the quest was created with.
    expect(bells(kingdom)).toMatchObject([
      { measure: 'tokens', used: 410_000, limit: 480_000, cut_at: 720_000, raise_from: 480_001 },
    ]);
  });

  it("rings once for a judge's session, which gets no reminder and no line", async () => {
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
    kingdom.clock.advance(SOFT);
    await steward.tick();
    kingdom.clock.advance(5);
    await steward.tick();
    const quest = await kingdom.quest('Judged');
    expect(await wrapUpLines(kingdom)).toEqual([]);
    expect(bells(kingdom)).toEqual([
      expect.objectContaining({ role: 'verifier', character: quest.verifier, measure: 'time', cut_at: HARD }),
    ]);
  });

  it('rings again for the fresh session that goes on after a cut, once it passes the mark itself', async () => {
    const { kingdom, steward } = await open({ plays: HANGS }, (k) => ({ plots: plotsOf(k, true) }));
    await kingdom.command('create_quest', questPayload('Cut'));
    await steward.tick();
    kingdom.clock.advance(SOFT);
    await steward.tick();
    kingdom.clock.advance(HARD - SOFT);
    await steward.tick();
    expect((await kingdom.quest('Cut')).status).toBe('returned');
    await steward.tick();
    expect((await kingdom.quest('Cut')).status).toBe('working');
    expect(bells(kingdom)).toHaveLength(1);
    kingdom.clock.advance(SOFT);
    await steward.tick();
    expect(bells(kingdom)).toHaveLength(2);
  });
});
