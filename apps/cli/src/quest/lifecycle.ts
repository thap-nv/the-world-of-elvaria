// `elvaria quest confirm|cancel|archive <id>`: commands the Steward turns into a transition (implementation-plan
// §2.5).
// The CLI asks the same table first, so a command the quest cannot take now is refused at the terminal.
import { findTransition } from '@elvaria/domain';
import type { Quest, QuestEventType } from '@elvaria/domain';

import { textOption } from '../args.ts';
import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { QUEST_STATUS_LABEL } from '../labels.ts';
import { readQuest } from './references.ts';
import { commandHeader, sendCommand } from './send-command.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';
import type { MessageKey } from '@elvaria/i18n';

/** The owner may cause `event` now: the quest's status has a row for it with U among its actors. */
export function ownerMay(quest: Quest, event: QuestEventType): boolean {
  const row = findTransition(quest, event);
  return row.ok && row.value.actors.includes('user');
}

/** The quest named on the command line, if the owner may cause `event` on it now. */
export async function questFor(
  input: CommandInput,
  ctx: KingdomContext,
  event: (quest: Quest) => QuestEventType,
  refused: MessageKey,
): Promise<Quest | undefined> {
  const quest = await readQuest(ctx, input.positionals[0] ?? '');
  if (Array.isArray(quest)) {
    quest.forEach(ctx.io.err);
    return undefined;
  }
  if (ownerMay(quest, event(quest))) return quest;
  ctx.io.err(ctx.t(refused, { id: quest.id, status: ctx.t(QUEST_STATUS_LABEL[quest.status]) }));
  return undefined;
}

async function runConfirm(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const quest = await questFor(input, ctx, () => 'confirm', 'cli.quest.confirm.refused');
  if (quest === undefined) return EXIT.failed;
  const command = { ...commandHeader(ctx), kind: 'confirm', payload: { quest: quest.id } } as const;
  return sendCommand(ctx, command, 'cli.quest.confirm.sent', { id: quest.id });
}

/** A draft is discarded (the `archive` command); any other unfinished quest is cancelled (§2.5). */
const cancelEvent = (quest: Quest): QuestEventType => (quest.status === 'draft' ? 'discard' : 'cancel');

async function runCancel(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const quest = await questFor(input, ctx, cancelEvent, 'cli.quest.cancel.refused');
  if (quest === undefined) return EXIT.failed;
  const reason = textOption(input, 'reason');
  const payload = { quest: quest.id, ...(reason === undefined ? {} : { reason }) };
  const kind = cancelEvent(quest) === 'discard' ? 'archive' : 'cancel';
  return sendCommand(ctx, { ...commandHeader(ctx), kind, payload }, 'cli.quest.cancel.sent', {
    id: quest.id,
  });
}

/**
 * A done quest gives its plot back (`done.archive`, §2.5): the Steward removes the worktree, keeps the branch and
 * lets each tribe CLI forget it. Only once delivered: the delivery note and the branch are what the owner merges
 * from, and a quest archived before the Steward delivered it would never be (P1-11).
 */
async function runArchive(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const quest = await questFor(input, ctx, () => 'archive', 'cli.quest.archive.refused');
  if (quest === undefined) return EXIT.failed;
  if (quest.deliverable.delivered_at === undefined) {
    ctx.io.err(ctx.t('cli.quest.archive.undelivered', { id: quest.id }));
    return EXIT.failed;
  }
  const command = { ...commandHeader(ctx), kind: 'archive', payload: { quest: quest.id } } as const;
  return sendCommand(ctx, command, 'cli.quest.archive.sent', { id: quest.id });
}

export const QUEST_ARCHIVE: CommandSpec = {
  name: ['quest', 'archive'],
  summary: 'cli.quest.archive.summary',
  args: [{ name: '<quest>', help: 'cli.quest.arg.quest' }],
  options: {},
  run: runArchive,
};

export const QUEST_CONFIRM: CommandSpec = {
  name: ['quest', 'confirm'],
  summary: 'cli.quest.confirm.summary',
  args: [{ name: '<quest>', help: 'cli.quest.arg.quest' }],
  options: {},
  run: runConfirm,
};

export const QUEST_CANCEL: CommandSpec = {
  name: ['quest', 'cancel'],
  summary: 'cli.quest.cancel.summary',
  args: [{ name: '<quest>', help: 'cli.quest.arg.quest' }],
  options: { reason: { type: 'string', value: '<text>', help: 'cli.quest.cancel.option.reason' } },
  run: runCancel,
};
