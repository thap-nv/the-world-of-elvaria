// planTick's heals (ADR 0034, plans/healer.md 4.3): a quest whose refused commit went back goes to a free healer of a
// doer's model family, waits while such a healer is busy, and with none that may take it goes back to its doer. It is
// never in two of `starts`, `redispatches` and `heals`.
import { describe, expect, it } from 'vitest';

import { FULL_TRIBE_LIMITS } from '../tribe/tribe-limits.ts';
import {
  CLASSES,
  DOCS,
  NOW,
  Q1,
  Q2,
  TERRITORY,
  character,
  moved,
  quest,
  snapshot,
  territory,
  workingBy,
} from './__fixtures__/snapshot.ts';
import { planTick } from './plan-tick.ts';
import type { Character } from '../schema/character/character.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { KingdomSnapshot, TickPlan } from './plan-tick.ts';

const HEALER_CLASSES = [
  ...CLASSES,
  { id: 'healer', is_verifier: false, kinds: [], is_healer: true },
] as unknown as KingdomSnapshot['registry']['classes'];

const REFUSED = { trip: 'commit', reason: 'breaker:commit_errors' } as const;

/** Thorn's first refused commit of run 1: the quest is returned, its run waiting for the heal. */
const due = (): Quest => moved(workingBy(quest(Q1), 'thorn'), 20, ['breaker', 'steward', REFUSED]);
const thorn = character('thorn');
const healer = (id: string, spec: Parameters<typeof character>[1] = {}): Character =>
  character(id, { cls: 'healer', ...spec });

const plan = (
  quests: readonly Quest[],
  characters: readonly Character[],
  more: Partial<KingdomSnapshot> = {},
) => planTick(snapshot(quests, characters, { registry: { classes: HEALER_CLASSES }, ...more }), NOW);

/** No quest is in two of starts, redispatches and heals. */
function expectOnce(tick: TickPlan): void {
  const all = [...tick.starts, ...tick.redispatches, ...tick.heals.map(({ quest: id }) => id)];
  expect(new Set(all).size).toBe(all.length);
}

describe('planTick: who heals a refused commit (ADR 0034)', () => {
  it('gives it to a free healer of the doer family, not to the doer, and keeps the run', () => {
    const tick = plan([due()], [thorn, healer('mira')]);
    expect(tick.heals).toEqual([{ quest: Q1, healer: 'mira' }]);
    expect(tick.redispatches).toEqual([]);
    expect(tick.starts).toEqual([]);
    expectOnce(tick);
    const healing = moved(due(), 30, ['heal', 'steward', { healer: 'mira' }]);
    expect(healing).toMatchObject({ status: 'healing', assignee: 'thorn', attempts: 1 });
  });

  it('takes the higher level first, and the healer is taken for the rest of the tick', () => {
    // On another territory: an unscoped quest works alone on its own (R2, PS-05).
    const other = moved(workingBy(quest(Q2, { territory: DOCS }), 'brann'), 20, [
      'breaker',
      'steward',
      REFUSED,
    ]);
    const tick = plan(
      [due(), other],
      [thorn, character('brann'), healer('mira'), healer('wren', { level: 5 })],
    );
    expect(tick.heals).toEqual([
      { quest: Q1, healer: 'wren' },
      { quest: Q2, healer: 'mira' },
    ]);
    expectOnce(tick);
  });

  it('waits while the only healer that may take it is busy: neither heal nor redispatch', () => {
    const tick = plan([due()], [thorn, healer('mira', { status: 'working' })]);
    expect(tick.heals).toEqual([]);
    expect(tick.redispatches).toEqual([]);
  });

  it('waits while the healer is free but the territory has no room', () => {
    const busy = workingBy(quest(Q2), 'brann');
    const full = { territories: [territory(TERRITORY, 1)] };
    const tick = plan(
      [due(), busy],
      [thorn, character('brann', { status: 'working' }), healer('mira')],
      full,
    );
    expect(tick.heals).toEqual([]);
    expect(tick.redispatches).toEqual([]);
  });

  it.each([
    ['there is no healer', [thorn], {}],
    ['the healer is of another family', [thorn, healer('mira', { tribe: 'gemini' })], {}],
    ['the healer is suspended', [thorn, healer('mira', { status: 'suspended' })], {}],
    // A gemini character on a Claude model draws on claude_gpt_models, which the example kingdom has disabled.
    [
      'the healer pool is closed',
      [thorn, healer('mira', { tribe: 'gemini', model: 'claude-sonnet-5-5' })],
      {},
    ],
    [
      'the healer tribe may not take the rank',
      [thorn, healer('mira')],
      { limits: { claude: { ...FULL_TRIBE_LIMITS, max_rank: 'F' }, gemini: FULL_TRIBE_LIMITS } },
    ],
  ] as const)('goes back to its doer when %s', (_why, characters, more) => {
    const tick = plan([due()], characters, more);
    expect(tick.heals).toEqual([]);
    expect(tick.redispatches).toEqual([Q1]);
    expectOnce(tick);
  });

  it('goes back to its doer when the quest territory is gone', () => {
    const tick = plan([due()], [thorn, healer('mira')], { territories: [] });
    expect(tick.heals).toEqual([]);
    expect(tick.redispatches).toEqual([]);
  });

  it('chooses again after a healer session that ended without the heal, in the same run', () => {
    const healing = moved(due(), 30, ['heal', 'steward', { healer: 'mira' }]);
    const paused = moved(healing, 40, ['mana_out', 'mana']);
    expect(plan([paused], [thorn, healer('wren')]).heals).toEqual([{ quest: Q1, healer: 'wren' }]);
    expect(plan([paused], [thorn]).redispatches).toEqual([Q1]);
    const doer = moved(paused, 50, ['redispatch', 'steward']);
    expect(doer.attempts).toBe(1);
    expect(doer.attempt_log.at(-1)).toMatchObject({ n: 1, character: 'thorn', heal: 'session' });
  });

  it('leaves every other return to its doer, and a cut that goes on to the starts', () => {
    const crashed = moved(workingBy(quest(Q1), 'thorn'), 20, ['crash', 'steward']);
    expect(plan([crashed], [thorn, healer('mira')])).toMatchObject({ heals: [], redispatches: [Q1] });
    const cut = moved(workingBy(quest(Q1), 'thorn'), 20, [
      'breaker',
      'steward',
      { trip: 'time', progress: true },
    ]);
    const tick = plan([cut], [thorn, healer('mira')]);
    expect(tick).toMatchObject({ heals: [], redispatches: [], starts: [Q1] });
  });

  it('counts a healing quest as at work on its territory, as a working one', () => {
    const brann = character('brann');
    expect(plan([due(), quest(Q2)], [brann]).claims).toMatchObject([{ quest: Q2, assignee: 'brann' }]);
    const healing = moved(due(), 30, ['heal', 'steward', { healer: 'mira' }]);
    expect(plan([healing, quest(Q2)], [brann]).claims).toEqual([]);
  });
});
