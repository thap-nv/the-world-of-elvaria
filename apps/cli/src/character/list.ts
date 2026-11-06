// `elvaria character list`: the kingdom's characters, with class, tribe, model, level and status.
import type { Character, Registry } from '@elvaria/domain';

import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { CHARACTER_STATUS_LABEL, nameIn } from '../labels.ts';
import { printListing } from '../listing.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

function characterRow(ctx: KingdomContext, registry: Registry | undefined, character: Character): string[] {
  const klass = registry?.classes.find((entry) => entry.id === character.class);
  return [
    character.id,
    character.name,
    klass === undefined ? character.class : nameIn(ctx.locale, klass),
    character.tribe,
    character.model,
    String(character.level),
    ctx.t(CHARACTER_STATUS_LABEL[character.status]),
  ];
}

async function runCharacterList(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const registry = await ctx.store.loadRegistry();
  const { items, issues } = await ctx.store.characters.list();
  return printListing(ctx, {
    header: [
      'cli.column.id',
      'cli.column.name',
      'cli.column.class',
      'cli.column.tribe',
      'cli.column.model',
      'cli.column.level',
      'cli.column.status',
    ],
    rows: items.map((character) => characterRow(ctx, registry.ok ? registry.value : undefined, character)),
    issues,
    empty: 'cli.character.none',
  });
}

export const CHARACTER_LIST: CommandSpec = {
  name: ['character', 'list'],
  summary: 'cli.character.list.summary',
  args: [],
  options: {},
  run: runCharacterList,
};
