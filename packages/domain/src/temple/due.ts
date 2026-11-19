// When the Temple is due (PS-12d, temple-first plan DB9 as the owner settled it): a pure rule over what the log says
// since the last `temple.ran`. Enabled, and one of three: `every_quests` runs judged across the kingdom; `weekly` on, a
// week gone and a new fail; or a character the Steward suspended for a fail streak that no run of the Temple has seen.
// The first two run at most once a local day, and never again on a day the clock went back to. A suspension does not
// wait for the next day: one run for each, as soon as the Monk's tribe is free, so the character waits no longer.
// The log is read in its order, not by the clock, so a clock set back never makes a suspension due twice.
import { daysBetween } from '../schedule/due.ts';
import { TEMPLE_WEEK_DAYS } from './constants.ts';
import { EVENT_DATA_SCHEMAS } from '../schema/event/event-data.ts';
import { CharacterChangeDataSchema } from '../schema/event/state-data.ts';
import type { CharacterId } from '../core/ids.ts';
import type { EventData } from '../schema/event/event-data.ts';
import type { Event } from '../schema/event/event.ts';
import type { TempleTrigger } from './constants.ts';

/** What the rule reads of `kingdom.schedule.temple`. */
export interface TempleSchedule {
  readonly enabled: boolean;
  readonly every_quests: number;
  readonly weekly: boolean;
}

/** What the log says since the last `temple.ran`. */
export interface TempleLog {
  /** The local day of the last `temple.ran`; null when the Temple never ran. */
  readonly last_day: string | null;
  /** Runs judged since (a pass or a fail; the owner's verdict on a run a judge decided is the same run). */
  readonly judged: number;
  /** Of them, the runs with a fail. */
  readonly fails: number;
  /** The characters the Steward suspended for a fail streak since, still suspended. */
  readonly suspended: readonly CharacterId[];
}

const OWNER_SUFFIX = /-user$/;

/** The run a verdict line judged: its id names the quest and the attempt; the owner's adds `-user`. */
const runOf = (verdict: unknown): string | undefined =>
  typeof verdict === 'string' ? verdict.replace(OWNER_SUFFIX, '') : undefined;

/**
 * The log folded for the rule, in its order. A suspension by the owner (actor `user`) is the owner's to lift, so it is
 * not counted; one the Steward wrote is the fail streak's (§2.6). Any later line of the character that is not
 * `suspended` ends it.
 */
export function templeLogOf(events: readonly Event[]): TempleLog {
  let last: string | null = null;
  let judged = new Set<string>();
  let fails = new Set<string>();
  let suspended = new Set<CharacterId>();
  for (const event of events) {
    if (event.type === 'temple.ran') {
      last = typeof event.data.day === 'string' ? event.data.day : last;
      [judged, fails, suspended] = [new Set(), new Set(), new Set()];
      continue;
    }
    const run = runOf(event.data.verdict);
    if ((event.type === 'verdict.pass' || event.type === 'verdict.fail') && run !== undefined) {
      judged.add(run);
      if (event.type === 'verdict.fail') fails.add(run);
    }
    if (CHARACTER_LINES.has(event.type)) suspended = withCharacterLine(suspended, event);
  }
  return { last_day: last, judged: judged.size, fails: fails.size, suspended: [...suspended] };
}

/** The lines that carry a character's view after its change. */
const CHARACTER_LINES: ReadonlySet<string> = new Set(
  Object.entries(EVENT_DATA_SCHEMAS).flatMap(([type, schema]) =>
    schema === CharacterChangeDataSchema ? [type] : [],
  ),
);

function withCharacterLine(suspended: Set<CharacterId>, event: Event): Set<CharacterId> {
  // EventSchema checked the data of these types against CharacterChangeDataSchema.
  const view = (event.data as EventData<'character.suspend'>).character;
  if (event.type === 'character.suspend' && event.actor.kind === 'steward') suspended.add(view.id);
  else if (view.status !== 'suspended') suspended.delete(view.id);
  return suspended;
}

/**
 * (PS-12g) Every character the Steward suspended for a fail streak that is suspended still, whether or not the Temple
 * ran since: the same fold as templeLogOf's, over the whole log. Only `release` and `temple_done` take a character out
 * of `suspended` (§2.6), and both write a `character.release` line; the owner's suspension of a character that holds a
 * quest rides on a `quest.*` line, but it never starts a fail streak's, so the character lines are enough.
 */
export function streakSuspendedOf(events: readonly Event[]): CharacterId[] {
  let suspended = new Set<CharacterId>();
  for (const event of events)
    if (CHARACTER_LINES.has(event.type)) suspended = withCharacterLine(suspended, event);
  return [...suspended];
}

/** Why the Temple is not due: off, it ran today (or on a later day the clock went back from), or nothing new yet. */
export type TempleIdle = 'disabled' | 'ran_today' | 'waiting';

export type TempleDue =
  | { readonly due: true; readonly trigger: Exclude<TempleTrigger, 'owner'> }
  | { readonly due: false; readonly why: TempleIdle };

/** Whether the Temple is due on local day `today`, and by which trigger; a suspension first. */
export function templeDue(schedule: TempleSchedule, log: TempleLog, today: string): TempleDue {
  if (!schedule.enabled) return { due: false, why: 'disabled' };
  if (log.suspended.length > 0) return { due: true, trigger: 'suspension' };
  const days = log.last_day === null ? null : daysBetween(log.last_day, today);
  if (days !== null && days < 1) return { due: false, why: 'ran_today' };
  if (log.judged >= schedule.every_quests) return { due: true, trigger: 'quests' };
  const weekGone = days === null || days >= TEMPLE_WEEK_DAYS;
  if (schedule.weekly && weekGone && log.fails > 0) return { due: true, trigger: 'weekly' };
  return { due: false, why: 'waiting' };
}
