// `elvaria quest deliver <id>` (PS-08c, ADR 0023): the owner asks the Steward to deliver a done quest's branch to its
// territory's forge again, once what stopped it is fixed (a secret taken off the branch, a credential signed in, the
// forge back). The Steward never tries a failed delivery on its own; this writes the `deliver` command (ADR 0005), and
// the Steward forgets the quest's outcome and delivers it from the start. Refused here, as the Steward would refuse
// it: a quest not done, or one whose territory delivers by hand (`manual`) or that is no branch of its own to push.
import { forgeDue } from '@elvaria/domain';

import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { QUEST_STATUS_LABEL } from '../labels.ts';
import { readQuest } from './references.ts';
import { commandHeader, sendCommand } from './send-command.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';

async function runDeliver(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const quest = await readQuest(ctx, input.positionals[0] ?? '');
  if (Array.isArray(quest)) {
    quest.forEach(ctx.io.err);
    return EXIT.failed;
  }
  if (quest.status !== 'done') {
    ctx.io.err(
      ctx.t('cli.quest.deliver.not_done', { id: quest.id, status: ctx.t(QUEST_STATUS_LABEL[quest.status]) }),
    );
    return EXIT.failed;
  }
  const territory = await ctx.store.territories.read(quest.territory);
  if (!forgeDue(quest, territory.ok ? territory.value : undefined)) {
    ctx.io.err(ctx.t('cli.quest.deliver.no_forge', { id: quest.id, territory: quest.territory }));
    return EXIT.failed;
  }
  const command = { ...commandHeader(ctx), kind: 'deliver', payload: { quest: quest.id } } as const;
  return sendCommand(ctx, command, 'cli.quest.deliver.sent', { id: quest.id });
}

export const QUEST_DELIVER: CommandSpec = {
  name: ['quest', 'deliver'],
  summary: 'cli.quest.deliver.summary',
  args: [{ name: '<quest>', help: 'cli.quest.arg.quest' }],
  options: {},
  run: runDeliver,
};
