// The envelope the herald writes around a client's command (ADR 0031 item 5, P2-01): the herald picks `id`, `ts`,
// `source` and `device`, the client only `kind` and `payload`, and the whole is checked against the inbox contract
// before anything reaches inbox/. Pure: the herald hands in the id and time it drew. (SEC-08) A command that pairs a
// new device names it too: the herald draws its id, as `herald pair` does, and no client picks one.
import { InboxCommandSchema } from '../schema/command/inbox-command.ts';
import { issuesOf } from './codec.ts';
import { err, ok } from '../core/result.ts';
import type { DeviceId, Ulid } from '../core/ids.ts';
import type { Result } from '../core/result.ts';
import type { DeviceSource } from '../device/may.ts';
import type { InboxCommand, InboxCommandKind } from '../schema/command/inbox-command.ts';
import type { ProtocolError } from './codec.ts';
import type { CommandMessage } from './messages.ts';

export interface Envelope {
  readonly id: Ulid;
  readonly ts: string;
  readonly source: DeviceSource;
  readonly device: DeviceId;
  /** The id the herald drew for the new device of a PAIRING_KINDS command; ignored for any other kind. */
  readonly pairs?: DeviceId;
}

/** (SEC-08) Kinds whose payload `device` is a device they make: the herald draws it, then prints its pairing code. */
export const PAIRING_KINDS: readonly InboxCommandKind[] = ['pair_device'];
export const isPairingKind = (kind: string): boolean => (PAIRING_KINDS as readonly string[]).includes(kind);

/** The inbox command of `message` in `envelope`; `invalid_message` with the contract's issues when it breaks it. */
export function commandOf(message: CommandMessage, envelope: Envelope): Result<InboxCommand, ProtocolError> {
  const { kind } = message;
  const { pairs, ...fields } = envelope;
  const payload = isPairingKind(kind) ? { ...message.payload, device: pairs } : message.payload;
  const parsed = InboxCommandSchema.safeParse({ version: 1, ...fields, kind, payload });
  return parsed.success ? ok(parsed.data) : err({ code: 'invalid_message', issues: issuesOf(parsed.error) });
}
