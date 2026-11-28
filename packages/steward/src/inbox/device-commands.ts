// The device commands (SEC-08, ADR 0037 item 2, ADR 0038): a full device pairs, changes and revokes devices from the
// phone, as `elvaria herald pair|device|revoke` does on the machine, and any device adds its own passkey. deviceRefusal
// has already held each to the sender's role and passkey; what the file becomes is the domain's (device/change.ts),
// and the Steward writes it under the file's lock. The owner's clients only: neither the Chancellor nor the temple.
import { changedDevice, pairedDevice, revokedDevice, withPasskey } from '@elvaria/domain';
import type {
  Device,
  DeviceChangeRefusal,
  DeviceId,
  InboxCommand,
  Result,
  TerritoryId,
} from '@elvaria/domain';

import { describeIssue } from '../tick/world.ts';
import { APPLIED, rejected } from './quest-commands.ts';
import type { Context } from '../context.ts';
import type { Outcome } from './quest-commands.ts';

type DeviceCommand = Extract<
  InboxCommand,
  { kind: 'pair_device' | 'set_device' | 'revoke_device' | 'add_passkey' }
>;
type Change = (current: Device) => Result<Device, DeviceChangeRefusal>;
type Attached = (id: TerritoryId) => boolean;

const isDeviceCommand = (command: InboxCommand): command is DeviceCommand =>
  ['pair_device', 'set_device', 'revoke_device', 'add_passkey'].includes(command.kind);

/** `change` on the file of `id`, under its lock; a missing file is `unknown_device`. */
async function update(ctx: Context, id: DeviceId, change: Change): Promise<Outcome> {
  const written = await ctx.deps.store.devices.update(id, change);
  if (written.ok) return APPLIED;
  const { error } = written;
  if (typeof error === 'string') return rejected(error);
  if (error.code === 'not_found') return rejected('unknown_device');
  ctx.deps.log.warn(`steward: cannot write ${describeIssue(error)}`);
  return rejected('failed');
}

async function pair(
  ctx: Context,
  command: Extract<DeviceCommand, { kind: 'pair_device' }>,
  attached: Attached,
): Promise<Outcome> {
  const device = pairedDevice(command.payload, command.ts, attached);
  if (!device.ok) return rejected(device.error);
  // The Herald drew the id; one taken already is a second apply of a command whose ack was lost, or a clash.
  if ((await ctx.deps.store.devices.read(device.value.id)).ok) return rejected('device_exists');
  const written = await ctx.deps.store.devices.write(device.value);
  if (written.ok) return APPLIED;
  ctx.deps.log.warn(`steward: cannot write ${describeIssue(written.error)}`);
  return rejected('failed');
}

function apply(ctx: Context, command: DeviceCommand): Promise<Outcome> {
  const attached: Attached = (id) => ctx.world.territories.has(id);
  if (command.kind === 'pair_device') return pair(ctx, command, attached);
  if (command.kind === 'set_device')
    return update(ctx, command.payload.device, (current) =>
      changedDevice(current, command.payload, attached),
    );
  if (command.kind === 'revoke_device')
    return update(ctx, command.payload.device, (current) =>
      revokedDevice(current, command.payload.passkey, command.ts),
    );
  // add_passkey names no device: the key is the sender's own, and deviceRefusal read its file already.
  const { device } = command;
  if (device === undefined) return Promise.resolve(rejected('unknown_device'));
  return update(ctx, device, (current) => withPasskey(current, command.payload.passkey, command.ts));
}

/** What a device command does; undefined for any other command. */
export function deviceCommand(ctx: Context, command: InboxCommand): Promise<Outcome> | undefined {
  if (!isDeviceCommand(command)) return undefined;
  if (command.source === 'chancellor' || command.source === 'monk')
    return Promise.resolve(rejected('owner_only'));
  return apply(ctx, command);
}
