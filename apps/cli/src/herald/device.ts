// `elvaria herald device <id> [--role <role>] [--territory <id>]… [--label <name>]` (P2-01b, ADR 0037): prints one
// device, or changes its role, territories or label in devices/<id>.json (the CLI's exception to ADR 0005, as for
// `herald pair`). The Herald reads the file again at every request and the Steward at every command, so a change
// counts at once; a session stays open, now with the new role. A revoked device stays revoked: pair a new one.
import { err, ok } from '@elvaria/domain';
import type { Device, Result } from '@elvaria/domain';

import { textOption, textOptions } from '../args.ts';
import { EXIT } from '../command-table/command.ts';
import { storeIssueLines } from '../issues.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { namedDevice, printDevices } from './list.ts';
import { deviceOf, grantOf, grantOfDevice, labelOf, roleOf } from './grant.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command-table/command.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { Grant, GrantProblem } from './grant.ts';

interface Change {
  readonly role: string | undefined;
  readonly label: string | undefined;
  readonly territories: readonly string[];
}

const changeOf = (input: CommandInput): Change => ({
  role: textOption(input, 'role'),
  label: textOption(input, 'label'),
  territories: textOptions(input, 'territory'),
});

/**
 * The grant after `change`: a new role keeps the territories it had when it is limited too, unless `--territory`
 * names others; only the label changing keeps the grant as it is, even over a territory detached since.
 */
async function grantAfter(
  ctx: KingdomContext,
  current: Device,
  change: Change,
): Promise<Result<Grant, GrantProblem>> {
  if (change.role === undefined && change.territories.length === 0) return ok(grantOfDevice(current));
  const role = change.role === undefined ? ok(current.role) : roleOf(ctx.t, change.role);
  if (!role.ok) return role;
  const kept = role.value === 'full' ? [] : grantOfDevice(current).territories;
  return grantOf(ctx, role.value, change.territories.length > 0 ? change.territories : kept);
}

async function save(
  ctx: KingdomContext,
  current: Device,
  change: Change,
): Promise<Result<Device, GrantProblem>> {
  const label = change.label === undefined ? ok(current.label) : labelOf(ctx.t, change.label);
  if (!label.ok) return label;
  const grant = await grantAfter(ctx, current, change);
  if (!grant.ok) return grant;
  // Rebuilt from the file as it is under the lock: a revoke written meanwhile keeps its revoked_at.
  const written = await ctx.store.devices.update(current.id, ({ version, id, created_at, revoked_at }) =>
    ok(
      deviceOf(
        { version, id, label: label.value, created_at, ...(revoked_at === undefined ? {} : { revoked_at }) },
        grant.value,
      ),
    ),
  );
  if (written.ok) return written;
  return err({ text: storeIssueLines(ctx.t, written.error).join('\n'), exit: EXIT.failed });
}

async function runDevice(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const { io, t } = ctx;
  const current = await namedDevice(ctx, input.positionals[0] ?? '');
  if (current === undefined) return EXIT.failed;
  const change = changeOf(input);
  if (change.role === undefined && change.label === undefined && change.territories.length === 0)
    return printDevices(ctx, [current], []);
  if (current.revoked_at !== undefined) {
    io.err(t('cli.herald.device.revoked', { id: current.id, at: current.revoked_at }));
    return EXIT.failed;
  }
  const saved = await save(ctx, current, change);
  if (!saved.ok) {
    io.err(saved.error.text);
    return saved.error.exit;
  }
  await printDevices(ctx, [saved.value], []);
  io.out(t('cli.herald.device.saved', { id: saved.value.id }));
  return EXIT.ok;
}

export const HERALD_DEVICE: CommandSpec = {
  name: ['herald', 'device'],
  summary: 'cli.herald.device.summary',
  args: [{ name: '<id>', help: 'cli.herald.device.arg.id' }],
  options: {
    role: { type: 'string', value: '<full|scoped|inquiry>', help: 'cli.herald.option.role' },
    territory: { type: 'string', value: '<id>', multiple: true, help: 'cli.herald.device.option.territory' },
    label: { type: 'string', value: '<name>', help: 'cli.herald.option.label' },
  },
  run: runDevice,
};
