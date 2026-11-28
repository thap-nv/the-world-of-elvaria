// `elvaria chronicle [--day <day>]` (P2-06): the chronicle of a local day. The Steward's file when it wrote one;
// otherwise one built on the spot from the files and the event log with the same ledger and words (dayLedgerOf,
// chronicleMarkdown), redacted, and written nowhere. No model, no mana, so it runs beside a Steward or without one.
import { createRedactor } from '@elvaria/eventlog';
import { dayLedgerOf, LOCAL_DAY_PATTERN } from '@elvaria/domain';
import { inKingdom, kingdomLayout, readKingdomSource, readTextFile } from '@elvaria/store';

import { EXIT } from '../command-table/command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { textOption } from '../args.ts';
import { chronicleMarkdown } from './markdown.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command-table/command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** `--day`, or today: ctx.now() is written in the kingdom's zone, so its date is the kingdom's local day. */
const dayAsked = (input: CommandInput, ctx: KingdomContext): string =>
  textOption(input, 'day') ?? ctx.now().slice(0, 'yyyy-mm-dd'.length);

/** The chronicle built from the files and the log now, with the note that it was; undefined if no ledger reads. */
async function liveChronicle(ctx: KingdomContext, day: string, file: string): Promise<string | undefined> {
  const source = await readKingdomSource(ctx.store, ctx.kingdom);
  const world = { tz: ctx.kingdom.tz, characters: source.characters, quests: source.quests };
  const ledger = dayLedgerOf(source.events, world, day);
  // The day passed LOCAL_DAY_PATTERN and kingdom.tz its schema: neither refusal can come.
  if (!ledger.ok) return undefined;
  const text = chronicleMarkdown(ctx.t, { name: ctx.kingdom.name, ledger: ledger.value });
  return `${createRedactor([])(text).trimEnd()}\n\n${ctx.t('chronicle.live_note', { file })}`;
}

async function runChronicle(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const day = dayAsked(input, ctx);
  if (!LOCAL_DAY_PATTERN.test(day)) {
    ctx.io.err(ctx.t('chronicle.bad_day'));
    return EXIT.usage;
  }
  const file = kingdomLayout.chronicle(day);
  const text = (await readTextFile(inKingdom(ctx.store.root, file))) ?? (await liveChronicle(ctx, day, file));
  if (text === undefined) return EXIT.failed;
  text.trimEnd().split('\n').forEach(ctx.io.out);
  return EXIT.ok;
}

export const CHRONICLE: CommandSpec = {
  name: ['chronicle'],
  summary: 'chronicle.summary',
  args: [],
  options: { day: { type: 'string', value: '<YYYY-MM-DD>', help: 'chronicle.option.day' } },
  run: runChronicle,
};
