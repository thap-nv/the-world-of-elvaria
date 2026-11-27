// The notices the Steward's digest builds from a world of the specs and a log (stewardNoticesOf, P2-04): no memo and no
// verdict unless the spec gives them, and the branches with nothing to push the forge book would add.
import { EventSchema, stewardNoticesOf } from '@elvaria/domain';
import type { Event, NoticeExtras, StewardNotices } from '@elvaria/domain';

import type { World } from '../tick/world.ts';

export const noticesOfWorld = (
  world: World,
  events: readonly Event[] = [],
  extras: NoticeExtras = {},
): StewardNotices =>
  stewardNoticesOf(
    {
      kingdom: world.kingdom,
      territories: [...world.territories.values()],
      characters: [...world.characters.values()],
      quests: [...world.quests.values()],
      memos: [],
      verdicts: [],
      registry: world.registry,
      events,
    },
    extras,
  );

let serial = 0;

/** A line of the Steward's, as the log holds it. */
export function stewardLine(type: string, data: Record<string, unknown>): Event {
  serial += 1;
  return EventSchema.parse({
    v: 2,
    id: `01JD${String(serial).padStart(22, '0')}`,
    ts: '2026-11-06T09:00:00+07:00',
    type,
    actor: { kind: 'steward' },
    data,
  });
}
