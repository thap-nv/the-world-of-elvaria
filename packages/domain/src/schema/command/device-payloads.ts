// Payloads of the device commands (SEC-08, ADR 0037 item 2, ADR 0038): from the phone, a full device pairs, changes
// and revokes devices as `elvaria herald pair|device|revoke` does on the machine, and any device adds its own
// passkeys. The Herald writes the command; the Steward applies it and writes the device file.
import { z } from 'zod';

import { DeviceIdSchema, TerritoryIdSchema } from '../../core/ids.ts';
import { unique } from '../common.ts';
import { DEVICE_LABEL_MAX_LENGTH, DEVICE_ROLES } from '../device/device.ts';
import { NewPasskeySchema, PasskeyIdSchema } from '../device/passkey.ts';

const describe = (description: string) => ({ description });
const LabelSchema = z.string().min(1).max(DEVICE_LABEL_MAX_LENGTH);
const TerritoriesSchema = unique(z.array(TerritoryIdSchema).min(1));
const GRANT_NOTE =
  'A full device carries no territories, a scoped or inquiry one at least one, each attached to the kingdom; the Steward refuses any other grant (bad_grant).';

/** A new device, as `herald pair` makes one; the Herald then prints a pairing code to the device that asked. */
export const PairDevicePayloadSchema = z
  .strictObject({
    device: DeviceIdSchema.meta(
      describe('The new device id: the Herald draws it, the client leaves it out.'),
    ),
    label: LabelSchema,
    role: z.enum(DEVICE_ROLES),
    territories: TerritoriesSchema.optional(),
  })
  .meta(describe(GRANT_NOTE));

/** Changes a device as `herald device` does: a new role keeps its territories when limited too, unless it names others. */
export const SetDevicePayloadSchema = z
  .strictObject({
    device: DeviceIdSchema,
    label: LabelSchema.optional(),
    role: z.enum(DEVICE_ROLES).optional(),
    territories: TerritoriesSchema.optional(),
  })
  .meta(describe(GRANT_NOTE));

/** Revokes a device, or only one of its passkeys (a lost security key) when `passkey` names it. */
export const RevokeDevicePayloadSchema = z.strictObject({
  device: DeviceIdSchema,
  passkey: PasskeyIdSchema.optional(),
});

/** A passkey for the sending device (`command.device`), as the Herald checked its registration. */
export const AddPasskeyPayloadSchema = z.strictObject({ passkey: NewPasskeySchema });
