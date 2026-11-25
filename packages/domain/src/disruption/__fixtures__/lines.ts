// Shortened event lines for the disruption specs (LL-01): only the type and the fields a rule reads, sample ids,
// no text of the kingdom's log or of the lesson files (plans/learning-loop.md VH3).
import type { Event } from '../../schema/event/event.ts';

export const QUEST = 'q_20261120_abcdef';
export const OTHER_QUEST = 'q_20261120_ghjkmn';
export const TERRITORY = 'sample';
export const SESSION = 'session-a';

/** 09:00 in the kingdom's zone, 2026-11-20: every line of a case is that many seconds later. */
const START = Date.parse('2026-11-20T09:00:00+07:00');
const ZONE_MS = 7 * 3_600_000;

export interface LineSpec {
  readonly type: string;
  /** Seconds after START; absent, one minute after the line before. */
  readonly at?: number;
  readonly quest?: string;
  readonly attempt?: number;
  readonly territory?: string;
  readonly session?: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

/** A time as the Steward writes it, in the kingdom's zone (+07:00). */
export function stamp(seconds: number): string {
  return `${new Date(START + seconds * 1000 + ZONE_MS).toISOString().slice(0, 19)}+07:00`;
}

const idOf = (index: number): Event['id'] => `01JD${String(index).padStart(22, '0')}` as Event['id'];

/** The lines of one case, in log order, with ids 01JD…0, 01JD…1, … */
export function linesOf(specs: readonly LineSpec[]): Event[] {
  let previous = -60;
  return specs.map((spec, index) => {
    const at = spec.at ?? previous + 60;
    previous = at;
    const { type, quest, attempt, territory, session, data } = spec;
    return {
      v: 2,
      id: idOf(index),
      ts: stamp(at),
      type,
      actor: { kind: 'steward' },
      ...(quest === undefined ? {} : { quest: quest as NonNullable<Event['quest']> }),
      ...(attempt === undefined ? {} : { attempt }),
      ...(territory === undefined ? {} : { territory: territory as NonNullable<Event['territory']> }),
      ...(session === undefined ? {} : { session }),
      data: { ...data },
    };
  });
}

export const evidenceOf = (index: number): Event['id'] => idOf(index);

/** A quest view with the fields the default kinds read. */
export const questView = (status: string, extra: Readonly<Record<string, unknown>> = {}) => ({
  quest: { id: QUEST, status, ...extra },
});
