// `elvaria herald revoke <id>` or `--all` (P2-01b, ADR 0037): sets `revoked_at` once in devices/<id>.json (the CLI's
// exception to ADR 0005, as for `herald pair`). The Herald ends the device's session at its next request and the
// Steward refuses its commands (device_revoked); the file stays, so the log still names the device.
import { ok } from '@elvaria/domain';
import type { Device } from '@elvaria/domain';

import { flagOption } from '../args.ts';
import { EXIT } from '../command-table/command.ts';
import { storeIssueLines } from '../issues.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { namedDevice } from './list.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command-table/command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** Revokes `device` under the store's lock; a revoke written meanwhile keeps its own time. */
async function revoke(ctx: KingdomContext, device: Device): Promise<boolean> {
  const { io, t } = ctx;
  const at = ctx.now();
  const written = await ctx.store.devices.update(device.id, (current) =>
    ok({ ...current, revoked_at: current.revoked_at ?? at }),
  );
  if (!written.ok) {
    storeIssueLines(t, written.error).forEach(io.err);
    return false;
  }
  io.out(t('cli.herald.revoke.revoked', { id: device.id, label: device.label }));
  return true;
}

async function revokeAll(ctx: KingdomContext): Promise<ExitCode> {
  const { items, issues } = await ctx.store.devices.list();
  issues.flatMap((issue) => storeIssueLines(ctx.t, issue)).forEach(ctx.io.err);
  const live = items.filter((device) => device.revoked_at === undefined);
  if (live.length === 0) ctx.io.out(ctx.t('cli.herald.revoke.none'));
  const done = await Promise.all(live.map((device) => revoke(ctx, device)));
  return issues.length === 0 && done.every(Boolean) ? EXIT.ok : EXIT.failed;
}

async function runRevoke(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const { io, t } = ctx;
  const named = input.positionals[0];
  if ((flagOption(input, 'all') === true) === (named !== undefined)) {
    io.err(t('cli.herald.revoke.one_target'));
    return EXIT.usage;
  }
  if (named === undefined) return revokeAll(ctx);
  const device = await namedDevice(ctx, named);
  if (device === undefined) return EXIT.failed;
  if (device.revoked_at !== undefined) {
    io.out(t('cli.herald.revoke.already', { id: device.id, at: device.revoked_at }));
    return EXIT.ok;
  }
  return (await revoke(ctx, device)) ? EXIT.ok : EXIT.failed;
}

export const HERALD_REVOKE: CommandSpec = {
  name: ['herald', 'revoke'],
  summary: 'cli.herald.revoke.summary',
  args: [{ name: '[<id>]', help: 'cli.herald.revoke.arg.id', optional: true }],
  options: { all: { type: 'boolean', help: 'cli.herald.revoke.option.all' } },
  run: runRevoke,
};
