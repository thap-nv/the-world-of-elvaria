// May this device send this command (P2-01, ADR 0037)? The Herald asks before it writes a command to inbox/, and the
// Steward asks again when it applies one of source herald or lite, since inbox/ is a folder any local program can
// write (ADR 0031 item 5). A pure decision on what the caller read: the device file, the command's group and scope.
import { err, ok } from '../core/result.ts';
import type { QuestId } from '../core/ids.ts';
import type { Result } from '../core/result.ts';
import type { COMMAND_SOURCES, InboxCommand, InboxCommandKind } from '../schema/command/inbox-command.ts';
import type { DELIVERABLE_TYPES } from '../schema/common.ts';
import type { Device } from '../schema/device/device.ts';
import { TRUSTED_GROUP } from './groups.ts';
import type { CommandGroup } from './groups.ts';
import type { CommandScope } from './scopes.ts';

/** The sources a paired device writes through: the Herald on loopback, the phone through the tunnel. */
export const DEVICE_SOURCES = [
  'herald',
  'lite',
] as const satisfies readonly (typeof COMMAND_SOURCES)[number][];
export type DeviceSource = (typeof DEVICE_SOURCES)[number];

export const isDeviceSource = (source: InboxCommand['source']): source is DeviceSource =>
  (DEVICE_SOURCES as readonly string[]).includes(source);

/** Why a device may not send a command; also the `reason` of the Steward's command.rejected line. */
export const DEVICE_REFUSALS = [
  /** No device named, or no file for the one named. */
  'unknown_device',
  'device_revoked',
  /** The role never sends this kind, or this group. */
  'role_forbids',
  /** The command reaches a territory the device was not given, or the whole kingdom. */
  'outside_territories',
  /** A phone's command of group 2 or 3 without the passkey's signature on it (W8; SEC-08 adds the signature). */
  'passkey_required',
] as const;
export type DeviceRefusalCode = (typeof DEVICE_REFUSALS)[number];
export interface DeviceRefusal {
  readonly code: DeviceRefusalCode;
}

/**
 * What an inquiry device may do (383a, W7): ask for a report, then answer or cancel the read-only quest that asks
 * it. The Chancellor's turn (P2-09) and summoning (P2-10) add their kinds here.
 */
type InquiryNeed = 'report_kind' | 'read_only_quest';
export const INQUIRY_KINDS: Readonly<Partial<Record<InboxCommandKind, InquiryNeed>>> = {
  create_quest: 'report_kind',
  answer: 'read_only_quest',
  cancel: 'read_only_quest',
};

export interface DeviceAsk {
  readonly source: DeviceSource;
  /** The file of `command.device`; undefined when the command names none or the file is missing or unreadable. */
  readonly device: Device | undefined;
  readonly kind: InboxCommandKind;
  readonly group: CommandGroup;
  readonly scope: CommandScope;
  /** Set by SEC-08 once the passkey signed this very command; nothing sets it before. */
  readonly confirmed?: boolean;
  /** create_quest: the `deliverable_type` of its quest kind in the registry; undefined when the kind is unknown. */
  readonly deliverable?: (typeof DELIVERABLE_TYPES)[number] | undefined;
  /** The quest the command acts on, when the caller knows it; `read_only` comes with P2-01d. */
  readonly quest?: { readonly id: QuestId; readonly read_only?: boolean } | undefined;
}

const refuse = (code: DeviceRefusalCode): Result<never, DeviceRefusal> => err({ code });

function inquiryAllows(ask: DeviceAsk): boolean {
  const need = INQUIRY_KINDS[ask.kind];
  if (need === undefined) return false;
  return need === 'report_kind' ? ask.deliverable === 'report' : ask.quest?.read_only === true;
}

const within = (scope: CommandScope, granted: readonly string[]): boolean =>
  scope !== 'kingdom' && scope.every((territory) => granted.includes(territory));

/** A limited role (383b): the same groups as `full` on its territories, never the trusted configuration. */
function roleRefusal(ask: DeviceAsk, device: Device): DeviceRefusalCode | undefined {
  if (device.role === 'full') return undefined;
  if (ask.group === TRUSTED_GROUP || (device.role === 'inquiry' && !inquiryAllows(ask)))
    return 'role_forbids';
  return within(ask.scope, device.territories) ? undefined : 'outside_territories';
}

/** The device when it may send the command; else the first reason, in the order the checks run. */
export function deviceMay(ask: DeviceAsk): Result<Device, DeviceRefusal> {
  const { device } = ask;
  if (device === undefined) return refuse('unknown_device');
  if (device.revoked_at !== undefined) return refuse('device_revoked');
  const role = roleRefusal(ask, device);
  if (role !== undefined) return refuse(role);
  // On loopback the passkey is not asked (ADR 0031 item 6): only local programs reach it.
  if (ask.source === 'lite' && ask.group > 1 && ask.confirmed !== true) return refuse('passkey_required');
  return ok(device);
}
