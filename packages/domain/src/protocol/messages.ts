// The WebSocket protocol between the herald and its clients, the 3D world and the lite phone client
// (implementation-plan §8, stage 2): `{type:'snapshot', state} | {type:'events', events} | {type:'command',
// command}`, fixed since P0-09 so the herald and the clients are built against the domain as it is. It lives in
// the domain because both ends import it, the browser included (ADR 0002).
import { z } from 'zod';

import { InboxCommandSchema } from '../schema/command/inbox-command.ts';
import { EventSchema } from '../schema/event/event.ts';
import { WorldStateSchema } from '../world/world-state.ts';

/** The whole state: the first message of a connection, and again whenever the herald rebuilt it. */
export const SnapshotMessageSchema = z.strictObject({ type: z.literal('snapshot'), state: WorldStateSchema });

/** New lines of the log, in order: the client reduces them into its state with the same `reduce`. */
export const EventsMessageSchema = z.strictObject({
  type: z.literal('events'),
  events: z.array(EventSchema).min(1),
});

/**
 * An owner action from a client. The herald only writes it to inbox/ for the Steward (ADR 0005), and a
 * WebSocket client is never the CLI.
 */
export const CommandMessageSchema = z
  .strictObject({ type: z.literal('command'), command: InboxCommandSchema })
  .refine(({ command }) => command.source !== 'cli', {
    path: ['command', 'source'],
    message: 'a WebSocket client sends commands as herald or lite',
  });

/** Herald → world and lite. */
export const ServerMessageSchema = z.discriminatedUnion('type', [SnapshotMessageSchema, EventsMessageSchema]);
/** World and lite → herald. */
export const ClientMessageSchema = z.discriminatedUnion('type', [CommandMessageSchema]);
export const ProtocolMessageSchema = z.discriminatedUnion('type', [
  SnapshotMessageSchema,
  EventsMessageSchema,
  CommandMessageSchema,
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ProtocolMessage = z.infer<typeof ProtocolMessageSchema>;
