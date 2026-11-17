// `elvaria memo decide <memo> <shelved|rejected|handled|accepted> [--quest <quest>] [--note "<text>"]`: the owner
// closes a letter (memo) once (PS-02, ADR 0024; `accepted` is an amendment's, PS-22b). Like seal and answer it is an
// inbox command the Steward applies (decide_memo, ADR 0005); the CLI refuses here what it can already tell: a closed
// or unknown memo, an unknown quest, a note that names another letter. It says back which letter it closes (kind,
// sender, first line): a run session once closed the wrong letter with a note written for another one ((151)).
import { MEMO_DECISIONS, MEMO_ID_PATTERN } from '@elvaria/domain';
import type { Memo } from '@elvaria/domain';

import { textOption } from '../args.ts';
import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { readQuest } from '../quest/references.ts';
import { commandHeader, sendCommand } from '../quest/send-command.ts';
import { MEMO_DECISION_LABEL, excerpt, memoFromOf, memoKindName, readMemo } from './memo.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** The owner's decisions; `sustained` and `overruled` are a second judge's (PS-22). */
type Decision = (typeof MEMO_DECISIONS)[number];
const isDecision = (value: string): value is Decision =>
  (MEMO_DECISIONS as readonly string[]).includes(value);

interface Asked {
  readonly decision: Decision;
  readonly quest?: string;
  /** Trimmed; empty when the owner gave none. */
  readonly note: string;
}

/** A letter id anywhere in a text, as MEMO_ID_PATTERN matches a whole one. */
const MEMO_ID_IN_TEXT = new RegExp(`\\b${MEMO_ID_PATTERN.source.slice(1, -1)}\\b`, 'g');

/** The first letter id the note names that is not the letter decided: a note written for another letter. */
const otherLetterIn = (note: string, memo: string): string | undefined =>
  note.match(MEMO_ID_IN_TEXT)?.find((named) => named !== memo);

/** The decision, its quest and note as the command line gives them, or the line that says what is wrong with it. */
function decisionOf(input: CommandInput, cli: CliContext): Asked | string {
  const decision = input.positionals[1] ?? '';
  if (!isDecision(decision))
    return cli.t('cli.memo.decide.bad_decision', { decision, decisions: MEMO_DECISIONS.join(', ') });
  const quest = textOption(input, 'quest');
  if (decision === 'handled' && quest === undefined) return cli.t('cli.memo.decide.needs_quest');
  if (decision !== 'handled' && quest !== undefined) return cli.t('cli.memo.decide.quest_only_handled');
  const memo = input.positionals[0] ?? '';
  const note = textOption(input, 'note')?.trim() ?? '';
  const other = otherLetterIn(note, memo);
  if (other !== undefined) return cli.t('cli.memo.decide.note_names_other', { id: memo, other });
  return quest === undefined ? { decision, note } : { decision, quest, note };
}

/** Which letter the decision closes, as the owner knows it: kind, sender, the first line of its text. */
async function letterLine(ctx: KingdomContext, memo: Memo): Promise<string> {
  const registry = await ctx.store.loadRegistry();
  const kind = memoKindName(ctx, registry.ok ? registry.value : undefined, memo.kind);
  const first = memo.body.split('\n').find((line) => line.trim() !== '') ?? '';
  const from = memoFromOf(ctx, memo);
  return ctx.t('cli.memo.decide.letter', { id: memo.id, kind, from, line: excerpt(first) });
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
  const { note } = asked;
  const payload = {
    memo: memo.id,
    decision: asked.decision,
    ...(quest === undefined ? {} : { quest: quest.id }),
    ...(note === '' ? {} : { note }),
  };
  ctx.io.out(await letterLine(ctx, memo));
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
