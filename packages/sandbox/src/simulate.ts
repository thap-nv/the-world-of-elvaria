// simulateDay: one fake day, as the lines of its event log (implementation-plan §7). Pure: no clock, no disk,
// randomness from the seed, so the same day, seed, date and kingdom give the same lines byte for byte. The
// morning is an empty world of that kingdom: territories are attached and the cast is summoned in the first
// minute, so a reader rebuilds the whole day from the lines alone (reduce, P0-09).
import { createIdSource, err, ok, poolsOf, zonedTime } from '@elvaria/domain';
import type { Event, Kingdom, Registry, Result, WorldSource } from '@elvaria/domain';

import { characterOf, drawArrivals, questOf, territoryOf } from './cast.ts';
import { scenarioProblems } from './check.ts';
import { DAY_MINUTES, dayClock, startOfDay } from './day-clock.ts';
import { dice } from './dice.ts';
import { createLedger } from './ledger.ts';
import { SCENARIOS } from './scenarios.ts';
import { tick } from './steward.ts';
import type { Arrival } from './cast.ts';
import type { ScenarioProblem } from './check.ts';
import type { Day } from './day.ts';
import type { DayId } from './scenario.ts';

export interface DayRequest {
  readonly day: DayId;
  /** A whole number; the same seed gives the same day. */
  readonly seed: number;
  /** The local date of the day, YYYY-MM-DD, in kingdom.tz. */
  readonly date: string;
}

export interface DayInput extends DayRequest {
  readonly kingdom: Kingdom;
  readonly registry: Registry;
}

export interface SandboxDay extends DayRequest {
  readonly events: readonly Event[];
  /** The world before the first line: the kingdom with no territory, character or quest yet. */
  readonly morning: WorldSource;
  /** The files after the last line. */
  readonly evening: WorldSource;
}

export type DayProblem =
  | ScenarioProblem
  | { readonly code: 'invalid_date'; readonly date: string }
  | { readonly code: 'invalid_time_zone'; readonly tz: string };

export const emptyMorning = (kingdom: Kingdom): WorldSource => ({
  kingdom,
  territories: [],
  characters: [],
  quests: [],
  campaigns: [],
  pools: poolsOf(kingdom.tribes),
});

/** Minute 0: the owner attaches the territories and summons the cast (as `elvaria territory add` would). */
function morningLines(day: Day): void {
  for (const seed of day.scenario.territories) day.ledger.attach(territoryOf(seed));
  const context = { registry: day.registry, zoned: day.zoned, dice: day.dice };
  for (const member of day.scenario.cast) day.ledger.summon((at) => characterOf(member, at, context));
}

function arrive(day: Day, arrivals: readonly Arrival[]): void {
  for (const arrival of arrivals.filter(({ minute }) => minute === day.clock.minute())) {
    const context = { kingdom: day.kingdom, registry: day.registry, locale: day.locale };
    day.ledger.create((at) => questOf(arrival, day.ids.quest(), at, context));
  }
}

export function simulateDay(input: DayInput): Result<SandboxDay, readonly DayProblem[]> {
  const { kingdom, registry } = input;
  const scenario = SCENARIOS[input.day];
  const problems = scenarioProblems(scenario, kingdom, registry);
  if (problems.length > 0) return err(problems);
  const zoned = zonedTime(kingdom.tz);
  const start = startOfDay(input.date, kingdom.tz);
  if (!zoned.ok) return err([{ code: 'invalid_time_zone', tz: kingdom.tz }]);
  if (!start.ok) return err([{ code: 'invalid_date', date: input.date }]);
  const roll = dice(input.seed);
  const clock = dayClock(start.value, zoned.value.format);
  const ids = createIdSource({ clock, random: roll.random, tz: kingdom.tz });
  if (!ids.ok) return err([{ code: 'invalid_time_zone', tz: kingdom.tz }]);
  const morning = emptyMorning(kingdom);
  const day: Day = {
    scenario,
    kingdom,
    registry,
    locale: kingdom.owner.locale,
    dice: roll,
    clock,
    ids: ids.value,
    zoned: zoned.value,
    ledger: createLedger(morning, clock, ids.value),
    agenda: new Map(),
    owner: new Map(),
    tokens: new Map(),
  };
  const arrivals = drawArrivals(scenario, roll);
  for (let minute = 0; minute <= DAY_MINUTES; minute += 1) {
    clock.advance(minute);
    if (minute === 0) morningLines(day);
    arrive(day, arrivals);
    tick(day);
  }
  const { seed, date } = input;
  const events = day.ledger.events();
  return ok({ day: input.day, seed, date, events, morning, evening: day.ledger.source() });
}
