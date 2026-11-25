// Journal lines of a running session as the Steward and the hooks write them (PS-28, PS-28b): the quest lines that
// name the seat, the session's start and end, and the Steward's notch lines, for `quest show` and `quest edit` specs.
import { EVENT_VERSION, EventSchema, questViewOf } from '@elvaria/domain';
import type { Event, Quest, Role } from '@elvaria/domain';
import { openJournal } from '@elvaria/eventlog';

let next = 0;

function line(quest: Quest, type: string, fields: Record<string, unknown>, data: unknown): Event {
  next += 1;
  return EventSchema.parse({
    v: EVENT_VERSION,
    id: `01M6RQ5Y000000000000000${String(next).padStart(3, '0')}`,
    ts: `2026-11-06T08:${String(next % 60).padStart(2, '0')}:00+07:00`,
    type,
    actor: { kind: 'steward' },
    quest: quest.id,
    territory: quest.territory,
    attempt: 1,
    ...fields,
    data,
  });
}

/** A Steward's quest line with the view of `quest` in `status`, naming the session when it opens one. */
export const moved = (quest: Quest, type: string, status: Quest['status'], session?: string): Event =>
  line(quest, type, session === undefined ? {} : { session }, { quest: questViewOf({ ...quest, status }) });

export const started = (quest: Quest, session: string, character: string): Event =>
  line(
    quest,
    'agent.session.start',
    { session, actor: { kind: 'character', id: character } },
    {
      session,
      model: 'claude-sonnet-5-5',
    },
  );

export const ended = (quest: Quest, session: string, character: string, outcome: string): Event =>
  line(quest, 'agent.session.end', { session, actor: { kind: 'character', id: character } }, { outcome });

/** A notch line of the Steward: `used` of `limit` on `measure`, with the default thresholds 85 and 150. */
export function notch(
  quest: Quest,
  session: string,
  gauge: {
    readonly role: Role;
    readonly measure: 'time' | 'tokens';
    readonly used: number;
    readonly limit: number;
  },
): Event {
  const pct = (gauge.used * 100) / gauge.limit;
  return line(quest, 'agent.session.usage', { session }, { ...gauge, pct, soft_pct: 85, hard_pct: 150 });
}

export async function journal(kingdom: string, quest: Quest, events: readonly Event[]): Promise<void> {
  await openJournal(kingdom, quest.id).append(events);
}
