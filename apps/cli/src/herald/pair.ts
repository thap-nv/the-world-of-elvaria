// `elvaria herald pair --role <role> --label <name> [--territory <id>]…` (P2-01b, ADR 0031 item 2, ADR 0037): a new
// device file with its role, then a one-time code for it, printed once as links to the Herald's loopback origin and to
// each origin of kingdom.herald. The CLI writes devices/<id>.json and .state/herald-pairing.json itself, an exception
// to ADR 0005 like `territory add` (.claude/rules/cli.md): a device is the owner's trusted setting, not quest state.
// The Herald need not run yet: the code waits for it for 5 minutes, and only its hash is written.
// `herald pair --device <id>` (P2-01c, §11 (616)(3)) pairs a device that exists again, when its browser lost the
// cookie: a new code for the same id, role and territories, and no device file written. A revoked device stays
// revoked; its old sessions are left to end after 30 idle days, as any other.
import { err, ok } from '@elvaria/domain';
import type { Device, Result } from '@elvaria/domain';
import { PAIRING_FILE, issuePairingCode, loopbackOrigin } from '@elvaria/herald';

import { textOption, textOptions } from '../args.ts';
import { EXIT } from '../command-table/command.ts';
import { storeIssueLines } from '../issues.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { deviceOf, grantOf, labelOf, roleName, roleOf } from './grant.ts';
import { namedDevice } from './list.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command-table/command.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { GrantProblem } from './grant.ts';

/** The device the command line asks for, with a fresh id; nothing is written yet. */
async function askedDevice(input: CommandInput, ctx: KingdomContext): Promise<Result<Device, GrantProblem>> {
  const role = roleOf(ctx.t, textOption(input, 'role') ?? '');
  if (!role.ok) return role;
  const label = labelOf(ctx.t, textOption(input, 'label') ?? '');
  if (!label.ok) return label;
  const grant = await grantOf(ctx, role.value, textOptions(input, 'territory'));
  if (!grant.ok) return err(grant.error);
  return ok(
    deviceOf({ version: 1, id: ctx.ids.device(), label: label.value, created_at: ctx.now() }, grant.value),
  );
}

/** A new device of `--role` and `--label`, written. */
async function createdDevice(input: CommandInput, ctx: KingdomContext): Promise<Result<Device, ExitCode>> {
  const { io, t, store } = ctx;
  // Required unless --device names one: the parser cannot say "one or the other", so the check is here.
  const missing = (['role', 'label'] as const).find((name) => textOption(input, name) === undefined);
  if (missing !== undefined) {
    io.err(t('cli.error.missing_option', { option: `--${missing}` }));
    return err(EXIT.usage);
  }
  const asked = await askedDevice(input, ctx);
  if (!asked.ok) {
    io.err(asked.error.text);
    return err(asked.error.exit);
  }
  const device = asked.value;
  const written = await store.devices.write(device);
  if (!written.ok) {
    storeIssueLines(t, written.error).forEach(io.err);
    return err(EXIT.failed);
  }
  io.out(
    t('cli.herald.pair.created', { id: device.id, label: device.label, role: roleName(t, device.role) }),
  );
  return ok(device);
}

/** The device `--device` names, as its file holds it: not revoked, and no other option beside it. */
async function existingDevice(
  input: CommandInput,
  ctx: KingdomContext,
  id: string,
): Promise<Result<Device, ExitCode>> {
  const { io, t } = ctx;
  const changes = [textOption(input, 'role'), textOption(input, 'label'), ...textOptions(input, 'territory')];
  if (changes.some((value) => value !== undefined)) {
    io.err(t('cli.herald.pair.device_alone'));
    return err(EXIT.usage);
  }
  const device = await namedDevice(ctx, id);
  if (device === undefined) return err(EXIT.failed);
  if (device.revoked_at !== undefined) {
    io.err(t('cli.herald.pair.revoked', { id: device.id, at: device.revoked_at }));
    return err(EXIT.failed);
  }
  io.out(t('cli.herald.pair.again', { id: device.id, label: device.label, role: roleName(t, device.role) }));
  return ok(device);
}

async function runPair(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const { io, t, store, kingdom } = ctx;
  const again = textOption(input, 'device');
  const device = await (again === undefined ? createdDevice(input, ctx) : existingDevice(input, ctx, again));
  if (!device.ok) return device.error;
  const deps = { root: store.root, clock: io.clock, format: ctx.format, random: io.random };
  const issued = await issuePairingCode(deps, device.value.id);
  if (!issued.ok) {
    io.err(t('cli.herald.locked', { file: PAIRING_FILE }));
    return EXIT.failed;
  }
  const { port, origins } = kingdom.herald;
  io.out(t('cli.herald.pair.open', { expires: issued.value.expires_at, port }));
  [loopbackOrigin(port), ...origins].forEach((origin) => {
    io.out(`${origin}/pair?code=${issued.value.code}`);
  });
  return EXIT.ok;
}

export const HERALD_PAIR: CommandSpec = {
  name: ['herald', 'pair'],
  summary: 'cli.herald.pair.summary',
  args: [],
  options: {
    role: { type: 'string', value: '<full|scoped|inquiry>', help: 'cli.herald.option.role' },
    territory: { type: 'string', value: '<id>', multiple: true, help: 'cli.herald.pair.option.territory' },
    label: { type: 'string', value: '<name>', help: 'cli.herald.option.label' },
    device: { type: 'string', value: '<id>', help: 'cli.herald.pair.option.device' },
  },
  run: runPair,
};
