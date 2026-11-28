// How many commands a device sends a minute (threat model "Trước P2-01" 4): every stream of the device counts
// together, so opening more tabs buys no more. Times come from the Herald's clock, never the client's.
import type { DeviceId, Instant } from '@elvaria/domain';

import { COMMANDS_PER_WINDOW_MAX, COMMAND_WINDOW_MS } from '../limit/limits.ts';

export interface CommandRate {
  /** True, and counted, when `device` may send one more command at `now`. */
  take(device: DeviceId, now: Instant): boolean;
}

export function commandRate(): CommandRate {
  const sent = new Map<DeviceId, readonly number[]>();
  return {
    take: (device, now) => {
      const recent = (sent.get(device) ?? []).filter((at) => now - at < COMMAND_WINDOW_MS);
      const allowed = recent.length < COMMANDS_PER_WINDOW_MAX;
      sent.set(device, allowed ? [...recent, now] : recent);
      return allowed;
    },
  };
}
