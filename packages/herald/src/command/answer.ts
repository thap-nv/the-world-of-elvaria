// What every answer to a stream's frame needs (P2-01c, SEC-08): who sent it, what the Herald has at hand, and the
// refusals of its own besides deviceMay's and the passkey checks' codes.
import type {
  Clock,
  Device,
  DeviceId,
  DeviceSource,
  IdSource,
  Instant,
  RandomSource,
  ServerMessage,
} from '@elvaria/domain';
import type { KingdomStore } from '@elvaria/store';

import type { FeedView } from '../stream/world-feed.ts';
import type { Challenges } from './challenges.ts';
import type { CommandRate } from './rate.ts';

export interface CommandDeps {
  readonly store: KingdomStore;
  readonly clock: Clock;
  readonly format: (at: Instant) => string;
  /** The command's id, and the new device's of a pair_device (SEC-08). */
  readonly ids: Pick<IdSource, 'ulid' | 'device'>;
  /** A registration's challenge, and a pair_device's pairing code. */
  readonly random: RandomSource;
  readonly rate: CommandRate;
  readonly challenges: Challenges;
  readonly view: () => FeedView;
}

/** Who sent the frame: the device of the stream's session, the origin it came through, and when it was paired. */
export interface Sender {
  readonly device: DeviceId;
  readonly source: DeviceSource;
  readonly origin: string;
  readonly opened_at: string;
}

/**
 * Refusals of the Herald's own (SEC-08 adds three): a `confirm` or `register` with no challenge waiting for its ref,
 * a passkey asked for on loopback (WebAuthn needs the tunnel's host), a first passkey long after the pairing.
 */
export type CommandRefusal =
  | 'invalid_message'
  | 'too_many_commands'
  | 'failed'
  | 'no_challenge'
  | 'passkey_needs_tunnel'
  | 'enroll_closed';

/** The message to send back, and the kind the frame asked for when it could be read. */
export interface CommandAnswer {
  readonly reply: ServerMessage;
  readonly kind: string | undefined;
}

export const refused = (ref: string, reason: string, kind?: string): CommandAnswer => ({
  reply: { type: 'refused', ref, reason },
  kind,
});

/** The device file as it is now: a revoke takes effect at the next frame. */
export async function deviceOf(store: KingdomStore, id: DeviceId): Promise<Device | undefined> {
  const read = await store.devices.read(id);
  return read.ok ? read.value : undefined;
}
