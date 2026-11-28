import { z } from 'zod';

import { CharacterIdSchema, QuestIdSchema, UlidSchema } from '../core/ids.ts';
import { DateTimeSchema } from '../schema/common.ts';
import { isEventOf } from '../schema/event/event.ts';
import type { Event } from '../schema/event/event.ts';
import type { EventType } from '../schema/event/event-types.ts';
import type { WorldState } from '../world/world-state.ts';

export const BELL_KINDS = [
  'awaiting_seal',
  'infirmary',
  'pool_asleep',
  'alarm',
  'sealed',
  'chronicle',
  'notification',
] as const;

export const BellEntrySchema = z.strictObject({
  kind: z.enum(BELL_KINDS),
  ts: DateTimeSchema,
  event_id: UlidSchema,
  quest: QuestIdSchema.optional(),
  character: CharacterIdSchema.optional(),
  vibrate: z.boolean(),
});
export type BellEntry = z.infer<typeof BellEntrySchema>;

interface BellRule {
  readonly kind: BellEntry['kind'];
  readonly vibrate: boolean;
  readonly includes?: (event: Event, state: WorldState) => boolean;
}

/** A pass that actually needs the owner's seal, rather than an automatically completed quest. */
const awaitingSeal = (event: Event, state: WorldState): boolean =>
  isEventOf(event, 'quest.verdict') &&
  event.data.quest.status === 'awaiting_seal' &&
  state.quests[event.data.quest.id]?.status === 'awaiting_seal';

const wholePool = (event: Event): boolean =>
  isEventOf(event, 'mana.exhausted') && event.data.model === undefined;

/** Log counterparts of the Steward's notices; mappings are data (ADR 0016, P2-04b). */
export const BELL_TABLE = {
  'quest.verdict': { kind: 'awaiting_seal', vibrate: true, includes: awaitingSeal },
  'quest.infirmary': { kind: 'infirmary', vibrate: true },
  'mana.exhausted': { kind: 'pool_asleep', vibrate: true, includes: wholePool },
  'delegation.suspended': { kind: 'alarm', vibrate: true },
  'quest.sealed': { kind: 'sealed', vibrate: false },
  'chronicle.written': { kind: 'chronicle', vibrate: false },
  'agent.notification': { kind: 'notification', vibrate: false },
} as const satisfies Partial<Record<EventType, BellRule>>;

/** One line for MBell, using the state immediately after this event, never a later snapshot. */
export function bellEntryOf(event: Event, state: WorldState): BellEntry | undefined {
  const table: Readonly<Partial<Record<string, BellRule>>> = BELL_TABLE;
  const rule = Object.hasOwn(table, event.type) ? table[event.type] : undefined;
  if (rule === undefined || (rule.includes !== undefined && !rule.includes(event, state))) return undefined;
  const quest = event.quest === undefined ? {} : { quest: event.quest };
  const character = event.actor.kind === 'character' ? { character: event.actor.id } : {};
  return { kind: rule.kind, ts: event.ts, event_id: event.id, ...quest, ...character, vibrate: rule.vibrate };
}
