// The envelope the herald writes around a client's command (ADR 0031 item 5, P2-01): the herald picks `id`, `ts`,
// `source` and `device`, the client only `kind` and `payload`, and the whole is checked against the inbox contract
// before anything reaches inbox/. Pure: the herald hands in the id and time it drew.
import { InboxCommandSchema } from '../schema/command/inbox-command.ts';
import { issuesOf } from './codec.ts';
import { err, ok } from '../core/result.ts';
import type { DeviceId, Ulid } from '../core/ids.ts';
import type { Result } from '../core/result.ts';
import type { DeviceSource } from '../device/may.ts';
import type { InboxCommand } from '../schema/command/inbox-command.ts';
import type { ProtocolError } from './codec.ts';
import type { CommandMessage } from './messages.ts';

export interface Envelope {
  readonly id: Ulid;
  readonly ts: string;
  readonly source: DeviceSource;
  readonly device: DeviceId;
}

/** The inbox command of `message` in `envelope`; `invalid_message` with the contract's issues when it breaks it. */
export function commandOf(message: CommandMessage, envelope: Envelope): Result<InboxCommand, ProtocolError> {
  const { kind, payload } = message;
  const parsed = InboxCommandSchema.safeParse({ version: 1, ...envelope, kind, payload });
  return parsed.success ? ok(parsed.data) : err({ code: 'invalid_message', issues: issuesOf(parsed.error) });
}
