// `elvaria herald devices` (P2-01b, ADR 0037): every paired device with its role, the territories it was given, when
// it was created, when the Herald last saw it (the latest `last_seen_at` of its sessions) and when it was revoked.
// Nothing secret shows: the sessions file holds hashes only, and no hash is printed.
import { DeviceIdSchema } from '@elvaria/domain';
import type { Device, DeviceId } from '@elvaria/domain';
import { readSessions } from '@elvaria/herald';
import type { StoredSession } from '@elvaria/herald';
import type { StoreIssue } from '@elvaria/store';

import { EXIT } from '../command-table/command.ts';
import { storeIssueLines } from '../issues.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { NONE, printListing } from '../listing.ts';
import { roleName } from './grant.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command-table/command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** The latest `last_seen_at` of each device's sessions; times are compared as instants, offsets may differ. */
function lastSeenOf(sessions: readonly StoredSession[]): ReadonlyMap<DeviceId, string> {
  const latest = new Map<DeviceId, string>();
  for (const session of sessions) {
    const known = latest.get(session.device);
    if (known === undefined || Date.parse(session.last_seen_at) > Date.parse(known))
      latest.set(session.device, session.last_seen_at);
  }
  return latest;
}

/** The device `<id>` names, or undefined once the reason is printed (a file that does not parse says why). */
export async function namedDevice(ctx: KingdomContext, text: string): Promise<Device | undefined> {
  const id = DeviceIdSchema.safeParse(text);
  const found = id.success ? await ctx.store.devices.read(id.data) : undefined;
  if (found?.ok === true) return found.value;
  if (found !== undefined && found.error.code !== 'not_found')
    storeIssueLines(ctx.t, found.error).forEach(ctx.io.err);
  else ctx.io.err(ctx.t('cli.herald.device.unknown', { id: text }));
  return undefined;
}

/** `devices` as the table of `herald devices`; `herald device <id>` prints its one row the same way. */
export async function printDevices(
  ctx: KingdomContext,
  devices: readonly Device[],
  issues: readonly StoreIssue[],
): Promise<ExitCode> {
  const seen = lastSeenOf(await readSessions(ctx.store.root));
  return printListing(ctx, {
    header: [
      'cli.column.id',
      'cli.column.label',
      'cli.column.role',
      'cli.column.territory',
      'cli.column.created',
      'cli.column.last_seen',
      'cli.column.revoked',
    ],
    rows: devices.map((device) => [
      device.id,
      device.label,
      roleName(ctx.t, device.role),
      device.role === 'full' ? NONE : device.territories.join(', '),
      device.created_at,
      seen.get(device.id) ?? NONE,
      device.revoked_at ?? NONE,
    ]),
    issues,
    empty: 'cli.herald.devices.none',
  });
}

async function runDevices(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const { items, issues } = await ctx.store.devices.list();
  return printDevices(ctx, items, issues);
}

export const HERALD_DEVICES: CommandSpec = {
  name: ['herald', 'devices'],
  summary: 'cli.herald.devices.summary',
  args: [],
  options: {},
  run: runDevices,
};
