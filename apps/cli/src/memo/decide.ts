// `elvaria memo decide <memo> <shelved|rejected|handled> [--quest <quest>] [--note "<text>"]`: the owner closes a
// letter (memo) once (PS-02, ADR 0024). Like seal and answer it is an inbox command the Steward applies (decide_memo,
// ADR 0005); the CLI refuses here what it can already tell: a closed or unknown memo, an unknown quest.
import { MEMO_DECISIONS } from '@elvaria/domain';
import type { MemoOutcome } from '@elvaria/domain';

import { textOption } from '../args.ts';
import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { readQuest } from '../quest/references.ts';
import { commandHeader, sendCommand } from '../quest/send-command.ts';
import { MEMO_DECISION_LABEL, readMemo } from './memo.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';

type Decision = MemoOutcome['decision'];
const isDecision = (value: string): value is Decision =>
  (MEMO_DECISIONS as readonly string[]).includes(value);

/** The decision and its quest as the command line gives them, or the line that says what is wrong with it. */
function decisionOf(input: CommandInput, cli: CliContext): { decision: Decision; quest?: string } | string {
  const decision = input.positionals[1] ?? '';
  if (!isDecision(decision))
    return cli.t('cli.memo.decide.bad_decision', { decision, decisions: MEMO_DECISIONS.join(', ') });
  const quest = textOption(input, 'quest');
  if (decision === 'handled' && quest === undefined) return cli.t('cli.memo.decide.needs_quest');
  if (decision !== 'handled' && quest !== undefined) return cli.t('cli.memo.decide.quest_only_handled');
  return quest === undefined ? { decision } : { decision, quest };
}

async function runMemoDecide(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const asked = decisionOf(input, cli);
  if (typeof asked === 'string') {
    cli.io.err(asked);
    return EXIT.usage;
  }
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const memo = await readMemo(ctx, input.positionals[0] ?? '');
  const quest = asked.quest === undefined ? undefined : await readQuest(ctx, asked.quest);
  const problems = [...(Array.isArray(memo) ? memo : []), ...(Array.isArray(quest) ? quest : [])];
  if (problems.length > 0 || Array.isArray(memo) || Array.isArray(quest)) {
    problems.forEach(ctx.io.err);
    return EXIT.failed;
  }
  if (memo.state === 'closed') {
    ctx.io.err(ctx.t('cli.memo.decide.closed', { id: memo.id }));
    return EXIT.failed;
  }
  const note = textOption(input, 'note')?.trim() ?? '';
  const payload = {
    memo: memo.id,
    decision: asked.decision,
    ...(quest === undefined ? {} : { quest: quest.id }),
    ...(note === '' ? {} : { note }),
  };
  const decision = ctx.t(MEMO_DECISION_LABEL[asked.decision]);
  return sendCommand(ctx, { ...commandHeader(ctx), kind: 'decide_memo', payload }, 'cli.memo.decide.sent', {
    id: memo.id,
    decision,
  });
}

export const MEMO_DECIDE: CommandSpec = {
  name: ['memo', 'decide'],
  summary: 'cli.memo.decide.summary',
  args: [
    { name: '<memo>', help: 'cli.memo.arg.memo' },
    { name: '<decision>', help: 'cli.memo.decide.arg.decision' },
  ],
  options: {
    quest: { type: 'string', value: '<quest>', help: 'cli.memo.decide.option.quest' },
    note: { type: 'string', value: '<text>', help: 'cli.memo.decide.option.note' },
  },
  run: runMemoDecide,
};
