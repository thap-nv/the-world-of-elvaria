// Step 1 of a tick (implementation-plan §3.1): the inbox, in id order, before anything an agent does — the owner
// always goes first. Each command is applied once: its result is a `command.applied` or `command.rejected` line,
// and the file moves to inbox/done/. A command already answered in the log (the Steward stopped between the line
// and the move) is only moved (ADR 0005, idempotent by command id).
import { UlidSchema } from '@elvaria/domain';
import type { InboxCommand, Quest } from '@elvaria/domain';
import type { InboxItem } from '@elvaria/store';

import { deliverAgain, sendTrainOff } from '../forge/deliver-command.ts';
import { wake } from '../mana/step.ts';
import { answerQuest, decideAmendment } from '../memos/amendment.ts';
import { decideMemo } from '../memos/decide.ts';
import { escalate } from '../memos/escalate.ts';
import { STEWARD } from '../quest/record.ts';
import type { Line } from '../quest/record.ts';
import { release, suspend } from './character-commands.ts';
import { deviceCheck } from './device-check.ts';
import { deviceCommand } from './device-commands.ts';
import { reportEscape, resumeDelegation } from './delegation-commands.ts';
import { enqueueBranch } from './guest-commands.ts';
import { setLevel, setModel } from './character-settings.ts';
import { patrolNow } from '../patrol/again.ts';
import { hold, unhold } from './hold-commands.ts';
import {
  archive,
  cancel,
  changeRank,
  confirm,
  createQuest,
  edit,
  ownerMove,
  reassign,
  rejected,
} from './quest-commands.ts';
import { submitFromInfirmary } from './submit-command.ts';
import { applyTempleReport } from '../temple/apply.ts';
import { giveBack, seal } from './verdict-commands.ts';
import type { Context } from '../context.ts';
import type { Outcome } from './quest-commands.ts';

/** Commands the Steward does not apply yet; each names the task that brings it. */
const LATER: ReadonlySet<InboxCommand['kind']> = new Set([
  'summon',
  'send_to_temple',
  'declare_campaign',
  'close_campaign',
  'attach_territory',
  'pin_tag',
]);

// The optional quest of decide_memo and escalate_memo is the one that does the work, not the one they act on: neither
// comes here, nor decide_amendment, which names its memo only. (LL-04) The answer line names it all the same: the
// quest the command names, as the world holds it once the command is applied; a quest it does not hold is left out.
const questOf = (ctx: Context, command: InboxCommand): Quest | undefined =>
  'quest' in command.payload && command.payload.quest !== undefined
    ? ctx.world.quests.get(command.payload.quest)
    : undefined;

async function onQuest(ctx: Context, command: InboxCommand, quest: Quest): Promise<Outcome> {
  switch (command.kind) {
    case 'confirm':
      return confirm(ctx, quest, command.payload.assignee);
    case 'retry':
      return ownerMove(ctx, quest, command.kind);
    case 'cancel':
      return cancel(ctx, quest);
    case 'archive':
      return archive(ctx, quest);
    case 'seal':
      return seal(ctx, quest, command.payload.note);
    case 'return':
      return giveBack(ctx, quest, command.payload);
    case 'answer':
      return answerQuest(ctx, quest, command.payload.answer);
    case 'reassign':
      return reassign(ctx, quest, command.payload.character);
    case 'set_rank':
      return changeRank(ctx, quest, command.payload.rank);
    case 'edit_quest':
      return edit(ctx, quest, command);
    case 'deliver':
      return deliverAgain(ctx, quest);
    case 'hold':
      return hold(ctx, quest, command.payload.reason);
    case 'unhold':
      return unhold(ctx, quest);
    case 'submit':
      return submitFromInfirmary(ctx, quest);
    case 'report_escape':
      return reportEscape(ctx, quest, command.payload.note);
    default:
      return rejected('unsupported');
  }
}

/**
 * A command on a territory: patrol (PS-09d), resume_delegation (PS-08g), enqueue_branch (CM-07), a deliver naming a
 * territory (CM-08); else undefined.
 */
function territoryCommand(ctx: Context, command: InboxCommand): Outcome | Promise<Outcome> | undefined {
  if (command.kind === 'deliver' && 'territory' in command.payload)
    return sendTrainOff(ctx, command.source, command.payload.territory);
  if (command.kind === 'patrol') return patrolNow(ctx, command.payload.territory);
  if (command.kind === 'resume_delegation') return resumeDelegation(ctx, command.payload.territory);
  if (command.kind === 'enqueue_branch') return enqueueBranch(ctx, command);
  return undefined;
}

/** A command on no quest or territory: the temple's report (PS-12c), a device command (SEC-08); else undefined. */
function questlessCommand(ctx: Context, command: InboxCommand): Promise<Outcome> | undefined {
  if (command.kind === 'temple_report') return applyTempleReport(ctx, command);
  return deviceCommand(ctx, command);
}

/**
 * What one command does; a command kind of a later task is refused with `unsupported`. A paired device's command
 * is first checked against its device's role (P2-01) and its passkey signature (SEC-08): a refusal names why
 * (unknown_device, role_forbids, passkey_required…); an inquiry device's create_quest makes a read-only quest (P2-01d).
 */
export async function applyCommand(ctx: Context, command: InboxCommand): Promise<Outcome> {
  const checked = await deviceCheck(ctx, command);
  if (!checked.ok) return rejected(checked.error);
  if (LATER.has(command.kind)) return rejected('unsupported');
  if (command.kind === 'create_quest') return createQuest(ctx, command, checked.value.read_only);
  if (command.kind === 'wake') return wake(ctx, command.payload.tribe);
  if (command.kind === 'suspend') return suspend(ctx, command.payload.character, command.payload.reason);
  if (command.kind === 'release') return release(ctx, command.payload.character);
  if (command.kind === 'set_level') return setLevel(ctx, command.payload.character, command.payload.level);
  if (command.kind === 'set_model') return setModel(ctx, command.payload.character, command.payload.model);
  if (command.kind === 'decide_memo') return decideMemo(ctx, command);
  if (command.kind === 'escalate_memo') return escalate(ctx, command);
  if (command.kind === 'decide_amendment') return decideAmendment(ctx, command);
  const onTerritory = territoryCommand(ctx, command);
  if (onTerritory !== undefined) return onTerritory;
  const questless = questlessCommand(ctx, command);
  if (questless !== undefined) return questless;
  const quest = questOf(ctx, command);
  return quest === undefined ? rejected('unknown_quest') : onQuest(ctx, command, quest);
}

/** The quest and the territory a command's line is about: the outcome's, else (LL-04) the quest the command names. */
function placeOf(
  ctx: Context,
  outcome: Exclude<Outcome, { status: 'waiting' }>,
  command: InboxCommand | undefined,
): Pick<Line, 'quest' | 'territory'> {
  const applied = outcome.status === 'applied' ? outcome : undefined;
  const quest = applied?.quest ?? (command === undefined ? undefined : questOf(ctx, command));
  return {
    ...(quest === undefined ? {} : { quest }),
    ...(applied?.territory === undefined ? {} : { territory: applied.territory }),
  };
}

/**
 * The command's line. `kind` (PS-01b) lets the metrics ledger count the owner's steps from the log alone, and
 * `source` (PS-03b) tells the Chancellor's triage, and (PS-12c) the temple, from them; a file no command could be read
 * from has neither. A
 * `deliver` names its quest on the line (PS-08c), so the log alone says the quest's delivery was asked again, or
 * (CM-08) its territory, so the log alone says the owner sent the territory's train off. (LL-04) Every command that
 * names a quest the world holds puts it on its line, applied or rejected: the log alone ties a retry or an edit to it.
 */
async function answered(
  ctx: Context,
  id: string,
  outcome: Exclude<Outcome, { status: 'waiting' }>,
  command?: InboxCommand,
): Promise<void> {
  const type = outcome.status === 'applied' ? 'command.applied' : 'command.rejected';
  const data = {
    command_id: id,
    ...(outcome.status === 'rejected' ? { reason: outcome.reason } : {}),
    ...(command === undefined ? {} : { kind: command.kind }),
    ...(command?.source === 'chancellor' || command?.source === 'monk' ? { source: command.source } : {}),
    // (P2-01, threat model N10) the paired device a Herald's or phone's command came from, so the log names it.
    ...(command?.device === undefined ? {} : { device: command.device }),
  };
  await ctx.record.note({ type, actor: STEWARD, data, ...placeOf(ctx, outcome, command) });
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
    await answered(ctx, command.id, outcome, command);
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
