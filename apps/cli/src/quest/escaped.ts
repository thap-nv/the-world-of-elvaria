// `elvaria quest escaped <id> [--note …]` (PS-08g, K11; ADR 0023): the owner reports a defect that escaped into the
// base branch with a quest already there. The Steward writes `quest.escaped`, which the metrics count sealed or not;
// on a quest the delegation merged without the seal, it suspends the delegation of its territory until `elvaria
// territory delegation <id> --resume`. The command goes through the inbox (`report_escape`, ADR 0005); the domain's
// refusals (escapeOf: not in its base branch yet, reported already) are asked here first, on the log.
import { escapeOf } from '@elvaria/domain';
import type { EscapeError } from '@elvaria/domain';
import type { MessageKey } from '@elvaria/i18n';
import { openEventLog } from '@elvaria/eventlog';

import { textOption } from '../args.ts';
import { EXIT } from '../command-table/command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { readQuest } from './references.ts';
import { commandHeader, sendCommand } from './send-command.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command-table/command.ts';

const REFUSAL: Readonly<Record<EscapeError['code'], MessageKey>> = {
  not_merged: 'cli.quest.escaped.not_merged',
  already_reported: 'cli.quest.escaped.already_reported',
};

async function runEscaped(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const quest = await readQuest(ctx, input.positionals[0] ?? '');
  if (Array.isArray(quest)) {
    quest.forEach(ctx.io.err);
    return EXIT.failed;
  }
  const note = textOption(input, 'note');
  const line = escapeOf((await openEventLog(ctx.store.root).read()).events, quest.id, note);
  if (!line.ok) {
    ctx.io.err(ctx.t(REFUSAL[line.error.code], { id: quest.id }));
    return EXIT.failed;
  }
  const done = line.value.delegated ? 'cli.quest.escaped.sent_delegated' : 'cli.quest.escaped.sent';
  const payload = { quest: quest.id, ...(note === undefined ? {} : { note }) };
  return sendCommand(ctx, { ...commandHeader(ctx), kind: 'report_escape', payload }, done, {
    id: quest.id,
    territory: line.value.territory,
  });
}

export const QUEST_ESCAPED: CommandSpec = {
  name: ['quest', 'escaped'],
  summary: 'cli.quest.escaped.summary',
  args: [{ name: '<quest>', help: 'cli.quest.arg.quest' }],
  options: { note: { type: 'string', value: '<text>', help: 'cli.quest.escaped.option.note' } },
  run: runEscaped,
};
