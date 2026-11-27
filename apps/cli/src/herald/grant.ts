// What `herald pair` and `herald device` read from the command line: a role, the territories it is given and a
// label, held to the device file's rules (ADR 0037: full carries no territory, scoped and inquiry at least one, each
// attached to the kingdom) before anything is written, so the owner reads why in their language, not a schema issue.
import { DEVICE_LABEL_MAX_LENGTH, DEVICE_ROLES, TerritoryIdSchema, err, ok } from '@elvaria/domain';
import type { Device, DeviceRole, Result, TerritoryId } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';

import { EXIT } from '../command-table/command.ts';
import type { ExitCode } from '../command-table/command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

export interface Grant {
  readonly role: DeviceRole;
  /** Empty for a full device. */
  readonly territories: readonly TerritoryId[];
}

export interface GrantProblem {
  readonly text: string;
  readonly exit: ExitCode;
}

/** The fields of a device file besides its grant. */
export type DeviceFields = Omit<Device, 'role' | 'territories'>;

const usage = (text: string): Result<never, GrantProblem> => err({ text, exit: EXIT.usage });

/** The role's name in the owner's language (`device.role.*`, ADR 0014). */
export const roleName = (t: Translate, role: DeviceRole): string => t(`device.role.${role}`);

export function roleOf(t: Translate, text: string): Result<DeviceRole, GrantProblem> {
  const role = DEVICE_ROLES.find((candidate) => candidate === text);
  return role === undefined
    ? usage(t('cli.error.choice', { option: '--role', choices: DEVICE_ROLES.join(', ') }))
    : ok(role);
}

export function labelOf(t: Translate, text: string): Result<string, GrantProblem> {
  const label = text.trim();
  return label.length >= 1 && label.length <= DEVICE_LABEL_MAX_LENGTH
    ? ok(label)
    : usage(t('cli.herald.bad_label', { max: DEVICE_LABEL_MAX_LENGTH }));
}

/** `role` over the territories named: they must suit the role and each be attached to the kingdom. */
export async function grantOf(
  ctx: KingdomContext,
  role: DeviceRole,
  names: readonly string[],
): Promise<Result<Grant, GrantProblem>> {
  if (role === 'full')
    return names.length === 0 ? ok({ role, territories: [] }) : usage(ctx.t('cli.herald.full_territories'));
  if (names.length === 0) return usage(ctx.t('cli.herald.needs_territory', { role }));
  const asked = [...new Set(names)];
  const found = await Promise.all(
    asked.map(async (name) => {
      const id = TerritoryIdSchema.safeParse(name);
      return id.success && (await ctx.store.territories.read(id.data)).ok ? id.data : undefined;
    }),
  );
  const missing = asked.find((_, at) => found[at] === undefined);
  if (missing !== undefined)
    return err({ text: ctx.t('cli.herald.unknown_territory', { id: missing }), exit: EXIT.failed });
  return ok({ role, territories: found.filter((id) => id !== undefined) });
}

/** The grant a device file holds now. */
export const grantOfDevice = (device: Device): Grant =>
  device.role === 'full'
    ? { role: 'full', territories: [] }
    : { role: device.role, territories: device.territories };

/** A device file of `grant`: a full device carries no `territories` key, which its strict schema refuses. */
export const deviceOf = (fields: DeviceFields, grant: Grant): Device =>
  grant.role === 'full'
    ? { ...fields, role: 'full' }
    : { ...fields, role: grant.role, territories: [...grant.territories] };
