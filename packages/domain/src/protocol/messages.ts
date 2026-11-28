// The WebSocket protocol between the herald and its clients, the 3D world and the lite phone client
// (implementation-plan §8, stage 2): `snapshot` and `events` from the herald, `command` from a client, the
// herald's `accepted` or `refused` for each command, and (P2-04) the owner's attention queue in `attention`. It
// lives in the domain because both ends import it, the browser included (ADR 0002). (P2-01, ADR 0031 item 5) A client
// sends only what it asks for, `kind` and `payload`: the herald writes the envelope (`id`, `ts`, `source`,
// `device`), so no client can claim another source or device. (SEC-08, ADR 0038) A phone's command of group 2 or 3
// gets a `challenge` back, which a passkey signs (`confirm`); a device registers a passkey with `enroll` then
// `register`.
import { z } from 'zod';

import { DeviceIdSchema, REGISTRY_ID_PATTERN, UlidSchema } from '../core/ids.ts';
import { DateTimeSchema } from '../schema/common.ts';
import { ConfirmationSchema, PasskeyIdSchema, RegistrationSchema } from '../schema/device/passkey.ts';
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

/** (SEC-08) The pairing code of the device a pair_device command makes: shown once to the owner, never stored. */
const PairingSchema = z.strictObject({
  device: DeviceIdSchema,
  code: z.string().min(1),
  expires_at: DateTimeSchema,
});

/** The herald wrote the command to inbox/ as `command_id`; the Steward's command.applied or .rejected names it. */
export const AcceptedMessageSchema = z.strictObject({
  type: z.literal('accepted'),
  ref: CommandRefSchema,
  command_id: UlidSchema,
  pairing: PairingSchema.optional(),
});

/**
 * (SEC-08) What the client signs for `ref`, base64url: the command's challenge (`navigator.credentials.get` allowing
 * `passkeys`), or a fresh one for a passkey it registers (`create`, excluding `passkeys`, which it already holds).
 */
export const ChallengeMessageSchema = z.strictObject({
  type: z.literal('challenge'),
  ref: CommandRefSchema,
  challenge: z.string().regex(/^[\w-]{1,128}$/),
  passkeys: z.array(PasskeyIdSchema),
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

/** (SEC-08) A passkey's signature on the command the herald challenged for `ref`. */
export const ConfirmMessageSchema = z.strictObject({
  type: z.literal('confirm'),
  ref: CommandRefSchema,
  confirmation: ConfirmationSchema,
});

/** (SEC-08) Asks for a challenge to register a passkey for the sending device. */
export const EnrollMessageSchema = z.strictObject({ type: z.literal('enroll'), ref: CommandRefSchema });

/** (SEC-08) The passkey the browser made for the challenge of `ref`. */
export const RegisterMessageSchema = z.strictObject({
  type: z.literal('register'),
  ref: CommandRefSchema,
  registration: RegistrationSchema,
});

/** Herald → world and lite. */
export const ServerMessageSchema = z.discriminatedUnion('type', [
  SnapshotMessageSchema,
  EventsMessageSchema,
  AcceptedMessageSchema,
  RefusedMessageSchema,
  AttentionMessageSchema,
  ChallengeMessageSchema,
]);
/** World and lite → herald. */
export const ClientMessageSchema = z.discriminatedUnion('type', [
  CommandMessageSchema,
  ConfirmMessageSchema,
  EnrollMessageSchema,
  RegisterMessageSchema,
]);
export const ProtocolMessageSchema = z.discriminatedUnion('type', [
  ...ServerMessageSchema.options,
  ...ClientMessageSchema.options,
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ProtocolMessage = z.infer<typeof ProtocolMessageSchema>;
export type CommandMessage = z.infer<typeof CommandMessageSchema>;
