// `elvaria memo show <memo>`: one letter (memo) with its fields, how it was decided, then its whole text (PS-02).
import type { Memo } from '@elvaria/domain';
import type { MessageKey } from '@elvaria/i18n';

import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { NONE } from '../listing.ts';
import { renderTable } from '../table.ts';
import { MEMO_DECISION_LABEL, MEMO_STATE_LABEL, memoKindName, readMemo } from './memo.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

type Field = [MessageKey, string];

/** How the memo was closed: the decision, when, the quest that does the work, the owner's note. */
function outcomeFields(ctx: KingdomContext, memo: Memo): Field[] {
  const { outcome } = memo;
  if (outcome === undefined) return [];
  return [
    ['cli.memo.field.decision', `${ctx.t(MEMO_DECISION_LABEL[outcome.decision])} (${outcome.decision})`],
    ['cli.memo.field.decided', outcome.at],
    ...(outcome.quest === undefined ? [] : [['cli.memo.field.handled_by', outcome.quest] satisfies Field]),
    ...(outcome.note === undefined ? [] : [['cli.memo.field.note', outcome.note] satisfies Field]),
  ];
}

async function runMemoShow(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const memo = await readMemo(ctx, input.positionals[0] ?? '');
  if (Array.isArray(memo)) {
    memo.forEach(ctx.io.err);
    return EXIT.failed;
  }
  const registry = await ctx.store.loadRegistry();
  const fields: Field[] = [
    [
      'cli.memo.field.kind',
      `${memoKindName(ctx, registry.ok ? registry.value : undefined, memo.kind)} (${memo.kind})`,
    ],
    ['cli.memo.field.status', `${ctx.t(MEMO_STATE_LABEL[memo.state])} (${memo.state})`],
    ['cli.memo.field.from', memo.from],
    ['cli.memo.field.quest', memo.quest],
    ['cli.memo.field.run', String(memo.attempt)],
    ['cli.memo.field.to', memo.to.route],
    ['cli.memo.field.filed', memo.filed_at],
    ['cli.memo.field.refs', memo.refs.length === 0 ? NONE : memo.refs.join(', ')],
    ...outcomeFields(ctx, memo),
  ];
  const hint = memo.state === 'open' ? ['', ctx.t('cli.memo.show.hint', { id: memo.id })] : [];
  [
    memo.id,
    ...renderTable(fields.map(([label, value]) => [ctx.t(label), value])),
    '',
    memo.body,
    ...hint,
  ].forEach(ctx.io.out);
  return EXIT.ok;
}

export const MEMO_SHOW: CommandSpec = {
  name: ['memo', 'show'],
  summary: 'cli.memo.show.summary',
  args: [{ name: '<memo>', help: 'cli.memo.arg.memo' }],
  options: {},
  run: runMemoShow,
};
