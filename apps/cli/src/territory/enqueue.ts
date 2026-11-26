// `elvaria territory enqueue <id> --pr <number>` (CM-07, ADR 0032, plans/check-modes.md "mục khách"): the owner puts a
// pull request its own session opened into the territory's merge queue as a guest entry, through the inbox
// (`enqueue_branch`, ADR 0005). The Steward tries its head merged into the default branch in the territory's lane,
// after the quests due now, merges the pull request through the forge when green, refuses it otherwise
// (`delivery.guest_refused`: the session merges the default branch in, or fixes it, and enqueues it again), and never
// writes to its branch. The CLI refuses what the Steward surely would (an unknown territory, one not delivered by
// pr_merge); the Steward answers the rest (a pull request that waits already). No mana.
import { TerritoryIdSchema, deliveryOf } from '@elvaria/domain';

import { textOption } from '../args.ts';
import { EXIT } from '../command-table/command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { commandHeader, sendCommand } from '../quest/send-command.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command-table/command.ts';

async function runTerritoryEnqueue(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const { t, io } = ctx;
  const given = textOption(input, 'pr') ?? '';
  const pr = Number(given);
  if (!/^\d+$/u.test(given) || pr < 1) {
    io.err(t('cli.territory.enqueue.bad_pr', { value: given }));
    return EXIT.usage;
  }
  const id = TerritoryIdSchema.safeParse(input.positionals[0] ?? '');
  const found = id.success ? await ctx.store.territories.read(id.data) : undefined;
  if (!found?.ok) {
    io.err(t('cli.territory.enqueue.unknown', { id: input.positionals[0] ?? '' }));
    return EXIT.failed;
  }
  const territory = found.value;
  const mode = deliveryOf(territory).mode;
  if (territory.vcs.type !== 'git' || mode !== 'pr_merge') {
    io.err(t('cli.territory.enqueue.not_pr_merge', { id: territory.id, mode }));
    return EXIT.failed;
  }
  const command = {
    ...commandHeader(ctx),
    kind: 'enqueue_branch',
    payload: { territory: territory.id, pr },
  } as const;
  return sendCommand(ctx, command, 'cli.territory.enqueue.sent', { id: territory.id, pr });
}

export const TERRITORY_ENQUEUE: CommandSpec = {
  name: ['territory', 'enqueue'],
  summary: 'cli.territory.enqueue.summary',
  args: [{ name: '<id>', help: 'cli.territory.enqueue.arg.id' }],
  options: {
    pr: { type: 'string', value: '<number>', required: true, help: 'cli.territory.enqueue.option.pr' },
  },
  run: runTerritoryEnqueue,
};
