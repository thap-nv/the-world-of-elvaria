// planTick and mana (implementation-plan §3.5, ADR 0009): no session opens on a pool that sleeps, sits at the cap
// or is turned off; a pool is per character (poolOf); paused quests wake first once their pool is back.
import { describe, expect, it } from 'vitest';

import {
  KINGDOM,
  NOW,
  Q1,
  Q2,
  TERRITORY,
  at,
  character,
  moved,
  quest,
  returnedTo,
  snapshot,
  territory,
  workingBy,
} from './__fixtures__/snapshot.ts';
import { planTick } from './plan-tick.ts';
import type { TribeId } from '../core/ids.ts';
import type { ManaReading } from '../mana/reading.ts';
import type { Character } from '../schema/character/character.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { KingdomSnapshot } from './plan-tick.ts';

const CLAUDE = 'claude' as TribeId;
const takers = (
  quests: readonly Quest[],
  characters: readonly Character[],
  more: Partial<KingdomSnapshot> = {},
) =>
  planTick(snapshot(quests, characters, more), NOW).claims.map(({ quest: id, assignee }) => [id, assignee]);

describe('planTick: mana (§3.5)', () => {
  const GEMINI = 'gemini' as TribeId;
  const BOTH_POOLS = {
    ...KINGDOM,
    tribes: KINGDOM.tribes.map((tribe) =>
      tribe.id === GEMINI
        ? { ...tribe, pools: { gemini_models: { enabled: true }, claude_gpt_models: { enabled: true } } }
        : tribe,
    ),
  };
  const reading = (used: number, more: Partial<ManaReading> = {}): ManaReading => ({
    tribe: CLAUDE,
    pool: 'claude',
    window: 'five_hour',
    used_pct: used,
    resets_at: at(300),
    source: 'rate_limits',
    observed_at: at(100),
    exhausted: used >= 100,
    ...more,
  });
  const gauge = (...readings: ManaReading[]) => ({
    mana: { readings, config: { cap_pct: 98, king_reserve_pct: 2, warn_margin_pct: 10 } },
  });

  it('sleeps one pool of an account, not the other (poolOf)', () => {
    const scribes = [
      character('wren', { cls: 'scribe', tribe: 'gemini' }),
      character('ash', { cls: 'scribe', tribe: 'gemini', model: 'claude-opus-5-5-low' }),
    ];
    const asleep = { kingdom: BOTH_POOLS, asleep: [{ tribe: GEMINI, pool: 'gemini_models' }] };
    expect(takers([quest(Q1, { cls: 'scribe' })], scribes, asleep)).toEqual([[Q1, 'ash']]);
    // Off by default: the Gemini tribe stays the Gemini model family.
    expect(takers([quest(Q1, { cls: 'scribe' })], scribes.slice(1))).toEqual([]);
  });

  it('takes no new work on a pool at the cap, and goes on while it only warns', () => {
    expect(takers([quest(Q1)], [character('thorn')], gauge(reading(98)))).toEqual([]);
    expect(takers([quest(Q1)], [character('thorn')], gauge(reading(90)))).toEqual([[Q1, 'thorn']]);
    const returned = returnedTo(quest(Q1), 'thorn');
    expect(
      planTick(snapshot([returned], [character('thorn')], gauge(reading(99))), NOW).redispatches,
    ).toEqual([]);
  });

  it("keeps a model's own spent cap from its characters only", () => {
    const fable = reading(100, { window: 'weekly', model: 'fable' });
    const knights = [character('thorn', { model: 'claude-fable-5-1' }), character('kael')];
    expect(takers([quest(Q1)], knights, gauge(fable))).toEqual([[Q1, 'kael']]);
  });

  /** Thorn asleep on Q1, paused for mana at minute 20. */
  const paused = moved(workingBy(quest(Q1), 'thorn', 10), 20, ['mana_out', 'mana']);
  const sleeper = (id = 'thorn', on = Q1): Character => ({
    ...character(id, { status: 'sleeping_mana' }),
    status_before_sleep: 'working',
    current: { quest: on, role: 'assignee' },
  });

  it('wakes a paused quest once its pool is awake, before anything new', () => {
    const plan = planTick(snapshot([paused, quest(Q2)], [sleeper(), character('kael')]), NOW);
    expect(plan).toMatchObject({ wakes: [Q1], claims: [{ quest: Q2, assignee: 'kael' }] });
    const full = planTick(
      snapshot([paused, quest(Q2)], [sleeper(), character('kael'), character('ella', { status: 'working' })]),
      NOW,
    );
    expect(full).toMatchObject({ wakes: [Q1], claims: [] });
  });

  it('leaves a paused quest asleep while its pool sleeps, its territory is full, or its assignee let go', () => {
    const asleep = { asleep: [{ tribe: CLAUDE, pool: 'claude' }] };
    expect(planTick(snapshot([paused], [sleeper()], asleep), NOW).wakes).toEqual([]);
    const one = { territories: [territory(TERRITORY, 1)] };
    const running = workingBy(quest(Q2), 'kael');
    expect(planTick(snapshot([paused, running], [sleeper()], one), NOW).wakes).toEqual([]);
    expect(planTick(snapshot([paused], [sleeper('thorn', Q2)]), NOW).wakes).toEqual([]);
    expect(planTick(snapshot([paused], [character('thorn')]), NOW).wakes).toEqual([]);
  });
});
