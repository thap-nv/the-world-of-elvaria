// The WebSocket protocol between the herald and its clients, the 3D world and the lite phone client
// (implementation-plan §8, stage 2): `snapshot` and `events` from the herald, `command` from a client, the
// herald's `accepted` or `refused` for each command, and (P2-04) the owner's attention queue in `attention`. It
// lives in the domain because both ends import it, the browser included (ADR 0002). (P2-01, ADR 0031 item 5) A client
// sends only what it asks for, `kind` and `payload`: the herald writes the envelope (`id`, `ts`, `source`,
// `device`), so no client can claim another source or device.
import { z } from 'zod';

import { REGISTRY_ID_PATTERN, UlidSchema } from '../core/ids.ts';
import { EventSchema } from '../schema/event/event.ts';
import { AttentionItemSchema } from '../world/attention-item.ts';
import { WorldStateSchema } from '../world/world-state.ts';

/** The whole state: the first message of a connection, and again whenever the herald rebuilt it. */
export const SnapshotMessageSchema = z.strictObject({ type: z.literal('snapshot'), state: WorldStateSchema });

/** New lines of the log, in order: the client reduces them into its state with the same `reduce`. */
export const EventsMessageSchema = z.strictObject({
  type: z.literal('events'),
  events: z.array(EventSchema).min(1),
});

/** A short tag the client picks to match the herald's answer to its command; never stored. */
export const CommandRefSchema = z.string().regex(/^[\w-]{1,64}$/);

/**
 * An owner action from a client. The herald puts `kind` and `payload` in the envelope it writes (commandOf), which
 * checks them against the inbox contract, and only writes the command to inbox/ for the Steward (ADR 0005).
 */
export const CommandMessageSchema = z.strictObject({
  type: z.literal('command'),
  ref: CommandRefSchema,
  kind: z.string().regex(REGISTRY_ID_PATTERN),
  payload: z.record(z.string(), z.unknown()),
});

/** The herald wrote the command to inbox/ as `command_id`; the Steward's command.applied or .rejected names it. */
export const AcceptedMessageSchema = z.strictObject({
  type: z.literal('accepted'),
  ref: CommandRefSchema,
  command_id: UlidSchema,
});

/** The herald wrote nothing: `reason` is a code, such as a device refusal of deviceMay. */
export const RefusedMessageSchema = z.strictObject({
  type: z.literal('refused'),
  ref: CommandRefSchema,
  reason: z.string().regex(REGISTRY_ID_PATTERN),
});

/**
 * (P2-04) What waits for the owner (attentionOf over the files and the log), whole: the herald sends it after a batch of
 * events when it changed, a limited device only the items of its territories (scopeAttention).
 */
export const AttentionMessageSchema = z.strictObject({
  type: z.literal('attention'),
  items: z.array(AttentionItemSchema),
});

/** Herald → world and lite. */
export const ServerMessageSchema = z.discriminatedUnion('type', [
  SnapshotMessageSchema,
  EventsMessageSchema,
  AcceptedMessageSchema,
  RefusedMessageSchema,
  AttentionMessageSchema,
]);
/** World and lite → herald. */
export const ClientMessageSchema = z.discriminatedUnion('type', [CommandMessageSchema]);
export const ProtocolMessageSchema = z.discriminatedUnion('type', [
  ...ServerMessageSchema.options,
  CommandMessageSchema,
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ProtocolMessage = z.infer<typeof ProtocolMessageSchema>;
export type CommandMessage = z.infer<typeof CommandMessageSchema>;
