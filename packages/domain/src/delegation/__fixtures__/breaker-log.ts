// Lines of the log for the breaker's specs (PS-08g): a quest's moves, the owner's report of an escaped defect, and the
// breaker's own two lines. `delivery.merged` comes from the patrol's fixtures.
import { QUEST_VIEW } from '../../world/__fixtures__/examples.ts';
import { EventSchema } from '../../schema/event/event.ts';
import type { QuestId } from '../../core/ids.ts';
import type { Event } from '../../schema/event/event.ts';
import type { QuestStatus } from '../../schema/quest/shared.ts';

export const ELVARIA = 'elvaria';
export const DOCS = 'docs-site';
export const Q1 = 'q_20261118_bbbbb1' as QuestId;
export const Q2 = 'q_20261118_bbbbb2' as QuestId;
export const Q3 = 'q_20261118_bbbbb3' as QuestId;

let serial = 0;
const lineOf = (type: string, ts: string, data: Record<string, unknown>, quest?: QuestId): Event => {
  serial += 1;
  return EventSchema.parse({
    v: 2,
    id: `01JD${String(serial).padStart(22, '0')}`,
    ts,
    type,
    actor: { kind: type === 'delegation.resumed' || type === 'quest.escaped' ? 'user' : 'steward' },
    ...(quest === undefined ? {} : { quest }),
    data,
  });
};

/** A move of `quest` that leaves it in `status` on `territory`. */
export const moved = (type: string, quest: QuestId, status: QuestStatus, territory = ELVARIA): Event =>
  lineOf(
    type,
    '2026-11-18T10:00:00+07:00',
    { quest: { ...QUEST_VIEW, id: quest, status, territory } },
    quest,
  );

export const escaped = (quest: QuestId, delegated: boolean, territory = ELVARIA): Event =>
  lineOf('quest.escaped', '2026-11-18T12:00:00+07:00', { quest, territory, delegated }, quest);

export const suspended = (
  territory: string,
  quest: QuestId,
  ts = '2026-11-18T06:30:00+07:00',
  extra: Readonly<Record<string, unknown>> = { cause: 'base_red', check: 'unit' },
): Event => lineOf('delegation.suspended', ts, { territory, quest, ...extra });

export const resumed = (territory: string, ts = '2026-11-18T20:00:00+07:00'): Event =>
  lineOf('delegation.resumed', ts, { territory });
