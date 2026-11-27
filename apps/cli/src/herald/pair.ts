// `elvaria herald pair --role <role> --label <name> [--territory <id>]…` (P2-01b, ADR 0031 item 2, ADR 0037): a new
// device file with its role, then a one-time code for it, printed once as links to the Herald's loopback origin and to
// each origin of kingdom.herald. The CLI writes devices/<id>.json and .state/herald-pairing.json itself, an exception
// to ADR 0005 like `territory add` (.claude/rules/cli.md): a device is the owner's trusted setting, not quest state.
// The Herald need not run yet: the code waits for it for 5 minutes, and only its hash is written.
import { err, ok } from '@elvaria/domain';
import type { Device, Result } from '@elvaria/domain';
import { PAIRING_FILE, issuePairingCode, loopbackOrigin } from '@elvaria/herald';

import { textOption, textOptions } from '../args.ts';
import { EXIT } from '../command-table/command.ts';
import { storeIssueLines } from '../issues.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { deviceOf, grantOf, labelOf, roleName, roleOf } from './grant.ts';
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

async function runPair(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const { io, t, store, kingdom } = ctx;
  const asked = await askedDevice(input, ctx);
  if (!asked.ok) {
    io.err(asked.error.text);
    return asked.error.exit;
  }
  const device = asked.value;
  const written = await store.devices.write(device);
  if (!written.ok) {
    storeIssueLines(t, written.error).forEach(io.err);
    return EXIT.failed;
  }
  io.out(
    t('cli.herald.pair.created', { id: device.id, label: device.label, role: roleName(t, device.role) }),
  );
  const deps = { root: store.root, clock: io.clock, format: ctx.format, random: io.random };
  const issued = await issuePairingCode(deps, device.id);
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
    role: { type: 'string', value: '<full|scoped|inquiry>', required: true, help: 'cli.herald.option.role' },
    territory: { type: 'string', value: '<id>', multiple: true, help: 'cli.herald.pair.option.territory' },
    label: { type: 'string', value: '<name>', required: true, help: 'cli.herald.option.label' },
  },
  run: runPair,
};
