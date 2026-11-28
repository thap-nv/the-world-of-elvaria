// The challenges the Herald waits on a passkey to answer (SEC-08, ADR 0038): a command of group 2 or 3 from the phone,
// held until its `confirm`, or a registration, until its `register`. In memory, by device and `ref`, used once,
// dropped after PASSKEY_CHALLENGE_TTL_MS; a Herald that restarts forgets them, and the client asks again.
import type { DeviceId, InboxCommand, Instant } from '@elvaria/domain';

import { PASSKEY_CHALLENGES_PER_DEVICE_MAX, PASSKEY_CHALLENGE_TTL_MS } from '../limit/limits.ts';

export type Waiting =
  | { readonly for: 'command'; readonly command: InboxCommand }
  | { readonly for: 'registration'; readonly challenge: string };

interface Held {
  readonly ref: string;
  readonly waiting: Waiting;
  readonly until: number;
}

export interface Challenges {
  /** Holds `waiting` for `ref` of `device`, in place of one the same ref held. */
  hold(device: DeviceId, ref: string, waiting: Waiting, now: Instant): void;
  /** What `ref` of `device` waits on, once; undefined when nothing does, or it expired. */
  take(device: DeviceId, ref: string, now: Instant): Waiting | undefined;
}

export function challenges(): Challenges {
  const held = new Map<DeviceId, readonly Held[]>();
  const live = (device: DeviceId, now: Instant) =>
    (held.get(device) ?? []).filter(({ until }) => now < until);
  return {
    hold: (device, ref, waiting, now) => {
      const kept = live(device, now).filter((entry) => entry.ref !== ref);
      const next = [...kept, { ref, waiting, until: now + PASSKEY_CHALLENGE_TTL_MS }];
      held.set(device, next.slice(-PASSKEY_CHALLENGES_PER_DEVICE_MAX));
    },
    take: (device, ref, now) => {
      const entries = live(device, now);
      const found = entries.find((entry) => entry.ref === ref);
      held.set(
        device,
        entries.filter((entry) => entry !== found),
      );
      return found?.waiting;
    },
  };
}
