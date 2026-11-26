// device v1: devices/<id>.json, one device paired with the Herald and the role it was given (P2-01, ADR 0037). A
// role is trusted configuration, not a cache: the Steward reads it again when it applies a command from the Herald or
// the phone, and no one but the owner's own commands writes it (`elvaria herald pair|device|revoke`, P2-01b).
import { z } from 'zod';

import { DeviceIdSchema, TerritoryIdSchema } from '../../core/ids.ts';
import { DateTimeSchema, GENERATED_NOTE, unique } from '../common.ts';

const describe = (description: string) => ({ description });

/**
 * `full` does everything the owner does; `scoped` works on the territories it was given; `inquiry` asks questions
 * there (a report quest, answers and cancels of its own read-only quests). The names shown are i18n's (ADR 0014).
 */
export const DEVICE_ROLES = ['full', 'scoped', 'inquiry'] as const;
export type DeviceRole = (typeof DEVICE_ROLES)[number];

/** Long enough for "Thắng's phone (work)", short enough for one line of `elvaria herald devices`. */
export const DEVICE_LABEL_MAX_LENGTH = 64;

const fields = {
  version: z.literal(1),
  id: DeviceIdSchema,
  label: z
    .string()
    .min(1)
    .max(DEVICE_LABEL_MAX_LENGTH)
    .meta(describe("The owner's name for it, from `elvaria herald pair --label`.")),
};

const times = {
  created_at: DateTimeSchema,
  revoked_at: DateTimeSchema.optional().meta(
    describe(
      'Set once by `elvaria herald revoke`: from then on the Herald ends its session and the Steward refuses its commands (device_revoked). The file stays, so the log still names the device.',
    ),
  ),
};

const FullDeviceSchema = z.strictObject({ ...fields, role: z.literal('full'), ...times });

/** A limited role carries the territories it may see and act on; never none. */
const limited = <R extends Exclude<DeviceRole, 'full'>>(role: R) =>
  z.strictObject({
    ...fields,
    role: z.literal(role),
    territories: unique(z.array(TerritoryIdSchema).min(1)),
    ...times,
  });

export const DeviceSchema = z
  .discriminatedUnion('role', [FullDeviceSchema, limited('scoped'), limited('inquiry')])
  .meta({
    title: 'Device',
    description:
      "devices/<id>.json: one device paired with the Herald (P2-01, ADR 0037) and its role: full (everything the owner may do), scoped (the work of the listed territories) or inquiry (questions on the listed territories). The Herald gates every request and command by it and sends a limited device only the world of its territories; the Steward checks a command of source herald or lite against it again (deviceMay). Only the owner's commands write it.",
    $comment: `${GENERATED_NOTE} A full device carries no territories; scoped and inquiry carry at least one. The Herald's sessions (.state/herald-sessions.json, ADR 0031) name a device by this id.`,
  });

export type Device = z.infer<typeof DeviceSchema>;
