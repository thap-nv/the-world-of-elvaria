// The Steward's second look at a command from a paired device (P2-01, ADR 0037, ADR 0031 item 5). The Herald gates
// every command by its device's role before it writes it, but inbox/ is a folder any local program can write, so a
// command of source herald or lite is checked again against the device file it names before it is applied. The
// decision is the domain's deviceMay; the Steward only reads what it needs. Other sources are not checked: a local
// program can still write `source: cli` (accepted in (365)); this check catches a Herald's mistake, not the OS user.
// (SEC-08, ADR 0038) A passkey signature on the command is checked again too, against the device file's passkeys,
// and its counter written back, so the same signature cannot pass a second time.
import {
  checkConfirmation,
  commandGroupOf,
  commandRefsOf,
  commandScopeOf,
  deviceMay,
  isDeviceSource,
  ok,
  withSignCount,
} from '@elvaria/domain';
import type {
  Device,
  InboxCommand,
  MemoId,
  PasskeyRefusal,
  PasskeyUse,
  QuestId,
  Result,
} from '@elvaria/domain';
import { nodePasskeyCrypto } from '@elvaria/store';

import { describeIssue } from '../tick/world.ts';
import type { Context } from '../context.ts';

/** The device file the command names; undefined when it names none or the file cannot be read. */
async function deviceOf(ctx: Context, command: InboxCommand): Promise<Device | undefined> {
  if (command.device === undefined) return undefined;
  const read = await ctx.deps.store.devices.read(command.device);
  if (read.ok) return read.value;
  if (read.error.code !== 'not_found') ctx.deps.log.warn(`steward: cannot read ${describeIssue(read.error)}`);
  return undefined;
}

/** The quest of each memo the command names, read from its file: memos are not part of the tick's world. */
async function memoQuests(ctx: Context, command: InboxCommand): Promise<ReadonlyMap<MemoId, QuestId>> {
  const reads = await Promise.all(
    commandRefsOf(command).memos.map((memo) => ctx.deps.store.memos.read(memo)),
  );
  return new Map(reads.flatMap((read) => (read.ok ? [[read.value.id, read.value.quest] as const] : [])));
}

const questOf = (ctx: Context, command: InboxCommand) =>
  'quest' in command.payload && command.payload.quest !== undefined
    ? ctx.world.quests.get(command.payload.quest)
    : undefined;

/** The deliverable of a new quest's kind, which tells an inquiry device's report from any other work (W7). */
const deliverableOf = (ctx: Context, command: InboxCommand) =>
  command.kind === 'create_quest'
    ? ctx.world.registry.kinds.find(({ id }) => id === command.payload.kind)?.deliverable_type
    : undefined;

/** What the command's passkey signature says, checked against the device file; undefined when it carries none. */
function confirmationOf(
  command: InboxCommand,
  device: Device | undefined,
): Result<PasskeyUse, PasskeyRefusal> | undefined {
  const { confirmation } = command;
  if (confirmation === undefined || device === undefined) return undefined;
  const passkeys = device.passkeys ?? [];
  return checkConfirmation({ crypto: nodePasskeyCrypto, command, confirmation, passkeys });
}

/** The counter the signature reached, into the device file; a failed write only costs a later replay check. */
async function noteSignCount(ctx: Context, command: InboxCommand, use: PasskeyUse): Promise<void> {
  if (command.device === undefined || use.sign_count === 0) return;
  const written = await ctx.deps.store.devices.update(command.device, (current) =>
    ok(withSignCount(current, use)),
  );
  if (!written.ok)
    ctx.deps.log.warn(`steward: cannot note a passkey counter: ${describeIssue(written.error)}`);
}

/** The refusal code when a device's command may not be applied; undefined when it may, or when no device sent it. */
export async function deviceRefusal(ctx: Context, command: InboxCommand): Promise<string | undefined> {
  if (!isDeviceSource(command.source)) return undefined;
  const memos = await memoQuests(ctx, command);
  const scope = commandScopeOf(command, {
    territoryOf: (quest) => ctx.world.quests.get(quest)?.territory,
    questOf: (memo) => memos.get(memo),
  });
  const device = await deviceOf(ctx, command);
  const confirmation = confirmationOf(command, device);
  const may = deviceMay({
    source: command.source,
    device,
    kind: command.kind,
    group: commandGroupOf(command),
    scope,
    confirmation,
    deliverable: deliverableOf(ctx, command),
    quest: questOf(ctx, command),
  });
  if (!may.ok) return may.error.code;
  if (confirmation?.ok === true) await noteSignCount(ctx, command, confirmation.value);
  return undefined;
}
