// `elvaria memo list [--all]`: the letters (memos) characters wrote outside their quests, oldest first (PS-02). Open
// ones only, unless `--all`. Reads memos/, writes nothing.
import { flagOption } from '../args.ts';
import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { printListing } from '../listing.ts';
import { MEMO_STATE_LABEL, excerpt } from './memo.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';

async function runMemoList(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const all = flagOption(input, 'all') === true;
  const { items, issues } = await ctx.store.memos.list();
  const shown = items
    .filter((memo) => all || memo.state === 'open')
    .sort((a, b) => a.filed_at.localeCompare(b.filed_at) || a.id.localeCompare(b.id));
  return printListing(ctx, {
    header: [
      'cli.column.id',
      'cli.column.kind',
      'cli.column.status',
      'cli.column.from',
      'cli.column.quest',
      'cli.column.text',
    ],
    rows: shown.map((memo) => [
      memo.id,
      memo.kind,
      ctx.t(MEMO_STATE_LABEL[memo.state]),
      memo.from,
      memo.quest,
      excerpt(memo.body),
    ]),
    issues,
    empty: all ? 'cli.memo.none' : 'cli.memo.none_open',
  });
}

export const MEMO_LIST: CommandSpec = {
  name: ['memo', 'list'],
  summary: 'cli.memo.list.summary',
  args: [],
  options: { all: { type: 'boolean', help: 'cli.memo.list.option.all' } },
  run: runMemoList,
};
