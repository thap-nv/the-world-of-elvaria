// `elvaria character list`: the kingdom's characters, with class, tribe, model, level and status. A character the
// Steward put to sleep for mana is marked with the gauge it waits for, and the sleeping gauges follow the table with
// their latest readings and resets (P1-32), so the owner sees why it takes nothing.
import type { Character, Registry } from '@elvaria/domain';

import { EXIT } from '../command.ts';
import { blockingGauge, gaugeName, readGauges, readingLines } from '../gauges.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { CHARACTER_STATUS_LABEL, nameIn } from '../labels.ts';
import { printListing } from '../listing.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { GaugeView } from '../gauges.ts';
import type { KingdomContext } from '../kingdom-context.ts';

/** The status; asleep for mana, marked with the sleeping gauge the character waits for. */
function statusCell(ctx: KingdomContext, gauges: readonly GaugeView[], character: Character): string {
  const status = ctx.t(CHARACTER_STATUS_LABEL[character.status]);
  const gauge = blockingGauge(gauges, ctx.kingdom.tribes, character);
  return gauge === undefined
    ? status
    : `${status} (${ctx.t('cli.character.mana_mark', { gauge: gaugeName(ctx.t, gauge) })})`;
}

function characterRow(
  ctx: KingdomContext,
  registry: Registry | undefined,
  gauges: readonly GaugeView[],
  character: Character,
): string[] {
  const klass = registry?.classes.find((entry) => entry.id === character.class);
  return [
    character.id,
    character.name,
    klass === undefined ? character.class : nameIn(ctx.locale, klass),
    character.tribe,
    character.model,
    String(character.level),
    statusCell(ctx, gauges, character),
  ];
}

/** Each sleeping gauge, then its readings, indented. */
const asleepLines = (ctx: KingdomContext, gauges: readonly GaugeView[]): string[] =>
  gauges
    .filter(({ asleep }) => asleep)
    .flatMap((gauge) => [
      ctx.t('cli.mana.asleep', { gauge: gaugeName(ctx.t, gauge) }),
      ...readingLines(ctx.t, gauge).map((line) => `    ${line}`),
    ]);

async function runCharacterList(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const registry = await ctx.store.loadRegistry();
  const { items, issues } = await ctx.store.characters.list();
  const gauges = await readGauges(ctx.store.root, ctx.io.clock.now());
  const code = printListing(ctx, {
    header: [
      'cli.column.id',
      'cli.column.name',
      'cli.column.class',
      'cli.column.tribe',
      'cli.column.model',
      'cli.column.level',
      'cli.column.status',
    ],
    rows: items.map((character) =>
      characterRow(ctx, registry.ok ? registry.value : undefined, gauges, character),
    ),
    issues,
    empty: 'cli.character.none',
  });
  const asleep = asleepLines(ctx, gauges);
  if (items.length > 0 && asleep.length > 0) ['', ...asleep].forEach(ctx.io.out);
  return code;
}

export const CHARACTER_LIST: CommandSpec = {
  name: ['character', 'list'],
  summary: 'cli.character.list.summary',
  args: [],
  options: {},
  run: runCharacterList,
};
