// What a device command makes of a device file (SEC-08, ADR 0037 item 2, ADR 0038), the same rules as the CLI's
// `herald pair|device|revoke` (P2-01b): pure, the Steward reads the file and writes the answer. Times are the
// command's own `ts`, when the owner gave the order. Passkeys and `revoked_at` survive every change.
import { err, ok } from '../core/result.ts';
import type { TerritoryId } from '../core/ids.ts';
import type { Result } from '../core/result.ts';
import type { CommandPayload } from '../schema/command/inbox-command.ts';
import { DeviceSchema } from '../schema/device/device.ts';
import type { Device } from '../schema/device/device.ts';
import type { NewPasskey, PasskeyId } from '../schema/device/passkey.ts';
import type { PasskeyUse } from '../passkey/confirmation.ts';

export type DeviceChangeRefusal =
  /** A territory named that is not attached to the kingdom. */
  | 'unknown_territory'
  /** A full device with territories, or a limited one without. */
  | 'bad_grant'
  | 'device_revoked'
  | 'passkey_unknown'
  | 'passkey_exists';

/** The candidate file held to the device contract; a field left undefined is left out, as the strict schema needs. */
const valid = (candidate: object): Result<Device, DeviceChangeRefusal> => {
  const fields = Object.entries(candidate).filter(([, value]) => value !== undefined);
  const parsed = DeviceSchema.safeParse(Object.fromEntries(fields));
  return parsed.success ? ok(parsed.data) : err('bad_grant');
};

const unknownOf = (named: readonly TerritoryId[] | undefined, attached: (id: TerritoryId) => boolean) =>
  (named ?? []).some((id) => !attached(id));

/** The device file of a `pair_device`. */
export function pairedDevice(
  { device, label, role, territories }: CommandPayload<'pair_device'>,
  at: string,
  attached: (id: TerritoryId) => boolean,
): Result<Device, DeviceChangeRefusal> {
  if (unknownOf(territories, attached)) return err('unknown_territory');
  return valid({ version: 1, id: device, label, role, territories, created_at: at });
}

/**
 * `current` after a `set_device`: a new role keeps the territories it had when it is limited too, unless the command
 * names others; a change of label alone keeps the grant even over a territory detached since, as `herald device`.
 */
export function changedDevice(
  current: Device,
  { label, role, territories }: CommandPayload<'set_device'>,
  attached: (id: TerritoryId) => boolean,
): Result<Device, DeviceChangeRefusal> {
  if (current.revoked_at !== undefined) return err('device_revoked');
  if (unknownOf(territories, attached)) return err('unknown_territory');
  const nextRole = role ?? current.role;
  const kept = current.role === 'full' || nextRole === 'full' ? undefined : current.territories;
  return valid({
    ...current,
    label: label ?? current.label,
    role: nextRole,
    territories: territories ?? kept,
  });
}

/** `current` revoked at `at`, or only its passkey `passkey`; a revoke said twice keeps the first time. */
export function revokedDevice(
  current: Device,
  passkey: PasskeyId | undefined,
  at: string,
): Result<Device, DeviceChangeRefusal> {
  if (passkey === undefined) return ok({ ...current, revoked_at: current.revoked_at ?? at });
  const passkeys = current.passkeys ?? [];
  if (!passkeys.some(({ id }) => id === passkey)) return err('passkey_unknown');
  return ok({
    ...current,
    passkeys: passkeys.map((key) =>
      key.id === passkey ? { ...key, revoked_at: key.revoked_at ?? at } : key,
    ),
  });
}

/** `current` with `passkey` added at `at`; an id it holds already, revoked or not, is refused. */
export function withPasskey(
  current: Device,
  passkey: NewPasskey,
  at: string,
): Result<Device, DeviceChangeRefusal> {
  if (current.revoked_at !== undefined) return err('device_revoked');
  const passkeys = current.passkeys ?? [];
  if (passkeys.some(({ id }) => id === passkey.id)) return err('passkey_exists');
  return ok({ ...current, passkeys: [...passkeys, { ...passkey, added_at: at }] });
}

/** `current` with the counter a confirmation reached, so the same signature cannot pass again (ADR 0038). */
export const withSignCount = (current: Device, use: PasskeyUse): Device => ({
  ...current,
  passkeys: (current.passkeys ?? []).map((key) =>
    key.id === use.passkey ? { ...key, sign_count: Math.max(key.sign_count, use.sign_count) } : key,
  ),
});
