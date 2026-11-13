// `elvaria quest confirm|cancel|archive|retry <id>`: commands the Steward turns into a transition (implementation-plan
// §2.5); `retry --to` sends `reassign` (lessons of 2026-11-12).
// The CLI asks the same table first, so a command the quest cannot take now is refused at the terminal.
import { findTransition } from '@elvaria/domain';
import type { Quest, QuestEventType } from '@elvaria/domain';

import { textOption } from '../args.ts';
import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { QUEST_STATUS_LABEL } from '../labels.ts';
import { classNames, giveQuestTo } from './assignee.ts';
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

/**
 * A draft is discarded (the `archive` command); a quest in the infirmary is archived, the one way out the table gives
 * the owner besides a retry (`infirmary.archive`: it has no `infirmary.cancel`, and the owner who reads «cancel» means
 * the same, P1-56); any other unfinished quest is cancelled (§2.5).
 */
const cancelEvent = (quest: Quest): QuestEventType => {
  if (quest.status === 'draft') return 'discard';
  return quest.status === 'infirmary' ? 'archive' : 'cancel';
};

async function runCancel(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const quest = await questFor(input, ctx, cancelEvent, 'cli.quest.cancel.refused');
  if (quest === undefined) return EXIT.failed;
  const reason = textOption(input, 'reason');
  const payload = { quest: quest.id, ...(reason === undefined ? {} : { reason }) };
  const event = cancelEvent(quest);
  const done = event === 'archive' ? 'cli.quest.cancel.sent_infirmary' : 'cli.quest.cancel.sent';
  return sendCommand(
    ctx,
    { ...commandHeader(ctx), kind: event === 'cancel' ? 'cancel' : 'archive', payload },
    done,
    { id: quest.id },
  );
}

/**
 * A done quest gives its plot back (`done.archive`, §2.5): the Steward removes the worktree, keeps the branch and
 * lets each tribe CLI forget it. Only once delivered: the delivery note and the branch are what the owner merges
 * from, and a quest archived before the Steward delivered it would never be (P1-11). A quest in the infirmary
 * (`infirmary.archive`) has no delivery to wait for: the owner gives it up, and the branch with its work stays (P1-56).
 */
async function runArchive(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const quest = await questFor(input, ctx, () => 'archive', 'cli.quest.archive.refused');
  if (quest === undefined) return EXIT.failed;
  if (quest.status === 'done' && quest.deliverable.delivered_at === undefined) {
    ctx.io.err(ctx.t('cli.quest.archive.undelivered', { id: quest.id }));
    return EXIT.failed;
  }
  const command = { ...commandHeader(ctx), kind: 'archive', payload: { quest: quest.id } } as const;
  return sendCommand(ctx, command, 'cli.quest.archive.sent', { id: quest.id });
}

/**
 * `retry --to`: the owner names who works the quest again, so the CLI sends the `reassign` command
 * (`infirmary.reassign`: the same full attempt budget, for that character only). Refused where no one works it again:
 * a script-tier quest, and a stalled review, whose work is done and wants a new judge, not a worker.
 */
async function retryWith(ctx: KingdomContext, quest: Quest, to: string, review: boolean): Promise<ExitCode> {
  let refusal: MessageKey | undefined;
  if (review) refusal = 'cli.quest.retry.to_review';
  else if (!ownerMay(quest, 'reassign')) refusal = 'cli.quest.retry.to_script';
  if (refusal === undefined) return giveQuestTo(ctx, quest, to, 'cli.quest.retry.sent_to');
  ctx.io.err(ctx.t(refusal, { id: quest.id, character: to }));
  return EXIT.failed;
}

/**
 * A quest in the infirmary opens again with its full attempt budget and nobody holding it (`infirmary.retry`, §2.5);
 * the Steward then gives it to whoever fits, as any open quest (P1-26), so the line says who that is and how to name
 * one: an owner who meant its last assignee saw it go to another (q_20261112_gwrz5m, lessons of 2026-11-12). One
 * whose review the breakers kept cutting goes back to review instead, same run, for a new judge
 * (`infirmary.retry.stalled_review`, owner after P1-23).
 */
async function runRetry(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const quest = await questFor(input, ctx, () => 'retry', 'cli.quest.retry.refused');
  if (quest === undefined) return EXIT.failed;
  const row = findTransition(quest, 'retry');
  const review = row.ok && row.value.to === 'review';
  const to = textOption(input, 'to');
  if (to !== undefined) return retryWith(ctx, quest, to, review);
  const command = { ...commandHeader(ctx), kind: 'retry', payload: { quest: quest.id } } as const;
  if (review) return sendCommand(ctx, command, 'cli.quest.retry.sent_review', { id: quest.id });
  // A script-tier quest has no class: the machine runs it again.
  if (!ownerMay(quest, 'reassign') || quest.class_required === undefined)
    return sendCommand(ctx, command, 'cli.quest.retry.sent', { id: quest.id });
  const className = await classNames(ctx);
  const params = { id: quest.id, class: className(quest.class_required) };
  return sendCommand(ctx, command, 'cli.quest.retry.sent_open', params);
}

export const QUEST_RETRY: CommandSpec = {
  name: ['quest', 'retry'],
  summary: 'cli.quest.retry.summary',
  args: [{ name: '<quest>', help: 'cli.quest.arg.quest' }],
  options: { to: { type: 'string', value: '<character>', help: 'cli.quest.retry.option.to' } },
  run: runRetry,
};

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
