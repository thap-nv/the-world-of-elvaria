// `elvaria quest hold <id>` and `elvaria quest unhold <id>` (fix/quest-hold, gap (10) of run (130)): the owner holds a
// quest no session has started, so the Steward neither claims nor starts it between two runs, and lifts the hold
// later. The quest keeps its status, description, dependencies and the character `quest add --to` named; before,
// `quest cancel` was the only way, and it archives the quest. Both write a command (ADR 0005); the domain's own
// refusals are asked here first, so a command the Steward would refuse is refused at the terminal.
import { holdRefusal, unholdRefusal } from '@elvaria/domain';
import type { HoldError, Quest } from '@elvaria/domain';
import type { MessageKey } from '@elvaria/i18n';

import { textOption } from '../args.ts';
import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { QUEST_STATUS_LABEL } from '../labels.ts';
import { readQuest } from './references.ts';
import { commandHeader, sendCommand } from './send-command.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

const REFUSAL: Readonly<Record<HoldError['code'], MessageKey>> = {
  not_holdable: 'cli.quest.hold.not_holdable',
  already_held: 'cli.quest.hold.already_held',
  not_held: 'cli.quest.unhold.not_held',
};

/** The quest named on the command line, if `refusal` lets the owner act on it now. */
async function heldQuestFor(
  input: CommandInput,
  ctx: KingdomContext,
  refusal: (quest: Quest) => HoldError | undefined,
): Promise<Quest | undefined> {
  const quest = await readQuest(ctx, input.positionals[0] ?? '');
  if (Array.isArray(quest)) {
    quest.forEach(ctx.io.err);
    return undefined;
  }
  const refused = refusal(quest);
  if (refused === undefined) return quest;
  ctx.io.err(ctx.t(REFUSAL[refused.code], { id: quest.id, status: ctx.t(QUEST_STATUS_LABEL[quest.status]) }));
  return undefined;
}

async function runHold(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const quest = await heldQuestFor(input, ctx, holdRefusal);
  if (quest === undefined) return EXIT.failed;
  const reason = textOption(input, 'reason');
  const payload = { quest: quest.id, ...(reason === undefined ? {} : { reason }) };
  return sendCommand(ctx, { ...commandHeader(ctx), kind: 'hold', payload }, 'cli.quest.hold.sent', {
    id: quest.id,
  });
}

async function runUnhold(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const quest = await heldQuestFor(input, ctx, unholdRefusal);
  if (quest === undefined) return EXIT.failed;
  const command = { ...commandHeader(ctx), kind: 'unhold', payload: { quest: quest.id } } as const;
  return sendCommand(ctx, command, 'cli.quest.unhold.sent', { id: quest.id });
}

export const QUEST_HOLD: CommandSpec = {
  name: ['quest', 'hold'],
  summary: 'cli.quest.hold.summary',
  args: [{ name: '<quest>', help: 'cli.quest.arg.quest' }],
  options: { reason: { type: 'string', value: '<text>', help: 'cli.quest.hold.option.reason' } },
  run: runHold,
};

export const QUEST_UNHOLD: CommandSpec = {
  name: ['quest', 'unhold'],
  summary: 'cli.quest.unhold.summary',
  args: [{ name: '<quest>', help: 'cli.quest.arg.quest' }],
  options: {},
  run: runUnhold,
};
