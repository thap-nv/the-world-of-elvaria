// Step 1 of a tick (implementation-plan §3.1): the inbox, in id order, before anything an agent does — the owner
// always goes first. Each command is applied once: its result is a `command.applied` or `command.rejected` line,
// and the file moves to inbox/done/. A command already answered in the log (the Steward stopped between the line
// and the move) is only moved (ADR 0005, idempotent by command id).
import { UlidSchema } from '@elvaria/domain';
import type { InboxCommand, Quest } from '@elvaria/domain';
import type { InboxItem } from '@elvaria/store';

import { wake } from '../mana/step.ts';
import { STEWARD } from '../record.ts';
import {
  answer,
  archive,
  cancel,
  changeRank,
  createQuest,
  edit,
  ownerMove,
  reassign,
  rejected,
  seal,
} from './quest-commands.ts';
import type { Context } from '../context.ts';
import type { Outcome } from './quest-commands.ts';

/** Commands the Steward does not apply yet; each names the task that brings it. */
const LATER: ReadonlySet<InboxCommand['kind']> = new Set([
  'return', // P1-04: the owner's return needs a verdict file with fail_kind and notes
  'summon',
  'suspend',
  'release',
  'send_to_temple',
  'declare_campaign',
  'close_campaign',
  'attach_territory',
  'pin_tag',
]);

const questOf = (ctx: Context, command: InboxCommand): Quest | undefined =>
  'quest' in command.payload ? ctx.world.quests.get(command.payload.quest) : undefined;

async function onQuest(ctx: Context, command: InboxCommand, quest: Quest): Promise<Outcome> {
  switch (command.kind) {
    case 'confirm':
    case 'retry':
      return ownerMove(ctx, quest, command.kind);
    case 'cancel':
      return cancel(ctx, quest);
    case 'archive':
      return archive(ctx, quest);
    case 'seal':
      return seal(ctx, quest, command.payload.note);
    case 'answer':
      return answer(ctx, quest, command.payload.answer);
    case 'reassign':
      return reassign(ctx, quest, command.payload.character);
    case 'set_rank':
      return changeRank(ctx, quest, command.payload.rank);
    case 'edit_quest':
      return edit(ctx, quest, command);
    default:
      return rejected('unsupported');
  }
}

/** What one command does; a command kind of a later task is refused with `unsupported`. */
export async function applyCommand(ctx: Context, command: InboxCommand): Promise<Outcome> {
  if (LATER.has(command.kind)) return rejected('unsupported');
  if (command.kind === 'create_quest') return createQuest(ctx, command);
  if (command.kind === 'wake') return wake(ctx, command.payload.tribe);
  const quest = questOf(ctx, command);
  return quest === undefined ? rejected('unknown_quest') : onQuest(ctx, command, quest);
}

async function answered(
  ctx: Context,
  id: string,
  outcome: Exclude<Outcome, { status: 'waiting' }>,
): Promise<void> {
  const type = outcome.status === 'applied' ? 'command.applied' : 'command.rejected';
  const data = { command_id: id, ...(outcome.status === 'rejected' ? { reason: outcome.reason } : {}) };
  await ctx.record.note({ type, actor: STEWARD, data });
  if (outcome.status === 'applied') ctx.counts.applied += 1;
  else ctx.counts.rejected += 1;
}

/** One inbox file; true when its command waits for a later pass. */
async function applyItem(ctx: Context, handled: Set<string>, item: InboxItem): Promise<boolean> {
  if (!item.command.ok) {
    // A file no command can be read from is refused once, under its name when that is a command id.
    ctx.deps.log.warn(`steward: inbox/${item.name}.json is no command: ${item.command.error.message}`);
    if (UlidSchema.safeParse(item.name).success && !handled.has(item.name))
      await answered(ctx, item.name, rejected(item.command.error.code));
    await ctx.deps.store.inbox.ack(item.name);
    return false;
  }
  const command = item.command.value;
  if (!handled.has(command.id)) {
    const outcome = await applyCommand(ctx, command);
    if (outcome.status === 'waiting') return true;
    await answered(ctx, command.id, outcome);
    handled.add(command.id);
  }
  await ctx.deps.store.inbox.ack(item.name);
  return false;
}

/**
 * Applies `items` (the whole inbox when not given) and returns the commands that wait. `handled` holds the command
 * ids the log has already answered, and grows with this tick's. The Steward passes the waiting ones again once the
 * sessions' ends are recorded, before any claim, so a freed asker gets its answer before new work (§3.1).
 */
export async function applyInbox(
  ctx: Context,
  handled: Set<string>,
  items?: readonly InboxItem[],
): Promise<InboxItem[]> {
  const waiting: InboxItem[] = [];
  for (const item of items ?? (await ctx.deps.store.inbox.read()))
    if (await applyItem(ctx, handled, item)) waiting.push(item);
  return waiting;
}
