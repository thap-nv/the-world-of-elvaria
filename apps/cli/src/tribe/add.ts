// `elvaria tribe add <id> --adapter <adapter> [--sibling-of <root>] [--max-concurrent <n>]` (implementation-plan
// §3.14 step 1, ADR 0021): a new tribe in kingdom.tribes[], disabled. The owner then pins its CLI (`elvaria doctor`)
// and runs the conformance suite (`elvaria tribe check`), which enables it once it passes. No character, quest or
// other file changes: a tribe is an open id, and the characters of the new tribe are summoned afterwards
// (`elvaria character add --tribe`). It prints the look the tribe draws from the theme's pool (PS-24, said at once
// since PS-23), and points to docs/guides/adding-a-tribe.md when the adapter is not there yet.
// `--sibling-of` (PS-27b) makes the row a second account of the root's CLI: `--adapter` defaults to the root's, and
// the command refuses a root kingdom.json lacks, a root that is a sibling itself and another adapter (exit 1), checked
// again under the kingdom file's lock, so the sibling_of it writes is valid; doctor warns of one edited by hand (CT7).
import { stat } from 'node:fs/promises';

import { TribeIdSchema, TribeSchema, err, ok } from '@elvaria/domain';
import type { Tribe, TribeId } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';

import { textOption } from '../args.ts';
import { EXIT } from '../command.ts';
import { BUILT_IN_ADAPTERS } from '../run/crew.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { adapterFilePath, isAdapterFile } from './adapter-file.ts';
import { kingdomPool, lookCellOf, lookViewOf } from './look-view.ts';
import { refuse, saveTribes } from './save.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

const DEFAULT_MAX_CONCURRENT = 1;

/** What the command line asks for, before the kingdom is read. */
interface Asked {
  readonly id: TribeId;
  readonly max: number;
  readonly adapter: string | undefined;
  readonly siblingOf: string | undefined;
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

/** Why the adapter cannot be named: neither a built-in adapter nor an adapter file that is there. */
async function adapterProblem(ctx: KingdomContext, adapter: string): Promise<string | undefined> {
  if (isAdapterFile(adapter)) {
    const file = adapterFilePath(ctx.store.root, adapter);
    return (await isFile(file)) ? undefined : ctx.t('cli.tribe.add.no_file', { adapter, file });
  }
  if (BUILT_IN_ADAPTERS[adapter] !== undefined) return undefined;
  const builtIn = Object.keys(BUILT_IN_ADAPTERS).join(', ');
  return ctx.t('cli.tribe.add.bad_adapter', { adapter, adapters: builtIn });
}

/** The command line read, or undefined once the reason is printed (exit 2). */
function askedOf(input: CommandInput, cli: CliContext): Asked | undefined {
  const id = TribeIdSchema.safeParse(input.positionals[0] ?? '');
  const adapter = textOption(input, 'adapter');
  const siblingOf = textOption(input, 'sibling-of');
  if (!id.success) cli.io.err(cli.t('cli.tribe.add.bad_id', { id: input.positionals[0] ?? '' }));
  else if (adapter === undefined && siblingOf === undefined) cli.io.err(cli.t('cli.tribe.add.no_adapter'));
  if (!id.success || (adapter === undefined && siblingOf === undefined)) return undefined;
  const max = Number(textOption(input, 'max-concurrent') ?? DEFAULT_MAX_CONCURRENT);
  return { id: id.data, max, adapter, siblingOf };
}

/** Why `--sibling-of` cannot name its root among `tribes` (PS-27b); undefined without the option. */
function siblingRefusal(t: Translate, tribes: readonly Tribe[], asked: Asked): string | undefined {
  const { siblingOf: root } = asked;
  if (root === undefined) return undefined;
  const found = tribes.find(({ id }) => id === root);
  if (found === undefined) {
    const known = tribes.map(({ id }) => id).join(', ');
    return t('cli.tribe.add.no_root', { tribe: asked.id, root, tribes: known });
  }
  if (found.sibling_of !== undefined)
    return t('cli.tribe.add.root_is_sibling', { root, of: found.sibling_of });
  if (asked.adapter === undefined || asked.adapter === found.adapter) return undefined;
  return t('cli.tribe.add.sibling_adapter', { root, adapter: asked.adapter, root_adapter: found.adapter });
}

/** The new row, its adapter the root's when `--adapter` is absent; undefined once the reason is printed (exit 2). */
function tribeOf(ctx: KingdomContext, asked: Asked): Tribe | undefined {
  const root = ctx.kingdom.tribes.find(({ id }) => id === asked.siblingOf);
  const adapter = asked.adapter ?? root?.adapter ?? '';
  const sibling = root === undefined ? {} : { sibling_of: root.id };
  const row = { id: asked.id, adapter, enabled: false, max_concurrent: asked.max, ...sibling };
  const parsed = TribeSchema.safeParse(row);
  if (parsed.success) return parsed.data;
  ctx.io.err(ctx.t('cli.tribe.add.bad_tribe', { id: asked.id, adapter, max: asked.max }));
  return undefined;
}

async function runAdd(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const asked = askedOf(input, cli);
  if (asked === undefined) return EXIT.usage;
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const refusal = siblingRefusal(ctx.t, ctx.kingdom.tribes, asked);
  if (refusal !== undefined) ctx.io.err(refusal);
  const tribe = refusal === undefined ? tribeOf(ctx, asked) : undefined;
  if (tribe === undefined) return refusal === undefined ? EXIT.usage : EXIT.failed;
  const problem = await adapterProblem(ctx, tribe.adapter);
  if (problem !== undefined) {
    ctx.io.err(problem);
    return EXIT.failed;
  }
  const saved = await saveTribes(ctx, (tribes) => {
    if (tribes.some(({ id }) => id === tribe.id))
      return err(refuse(ctx.t('cli.tribe.add.exists', { tribe: tribe.id })));
    const late = siblingRefusal(ctx.t, tribes, asked);
    return late === undefined ? ok([...tribes, tribe]) : err(refuse(late));
  });
  if (!saved) return EXIT.failed;
  addedLines(ctx, tribe).forEach(ctx.io.out);
  return EXIT.ok;
}

/**
 * What the owner reads once the row is written: the row, the look the new tribe draws (PS-24: last in
 * kingdom.tribes[], it takes what no tribe before it holds, so the line stays true until the owner chooses one; a
 * sibling's is its root's with the next aura, PS-27b), and what to do next. A theme without a pool has no look line.
 */
function addedLines(ctx: KingdomContext, tribe: Tribe): string[] {
  const { t } = ctx;
  const params = { tribe: tribe.id, adapter: tribe.adapter, root: tribe.sibling_of ?? '' };
  const sibling = tribe.sibling_of !== undefined;
  const pool = kingdomPool(ctx, true);
  const view = pool === undefined ? undefined : lookViewOf(pool, [...ctx.kingdom.tribes, tribe], tribe.id);
  const look = view === undefined ? [] : [{ ...params, look: lookCellOf(t, view), aura: view.look.aura }];
  return [
    t(sibling ? 'cli.tribe.add.added_sibling' : 'cli.tribe.add.added', params),
    ...look.map((values) => t(sibling ? 'cli.tribe.add.sibling_look' : 'cli.tribe.add.look', values)),
    t(sibling ? 'cli.tribe.add.sibling_next' : 'cli.tribe.add.next', params),
  ];
}

export const TRIBE_ADD: CommandSpec = {
  name: ['tribe', 'add'],
  summary: 'cli.tribe.add.summary',
  args: [{ name: '<id>', help: 'cli.tribe.add.arg.id' }],
  options: {
    adapter: { type: 'string', value: '<adapter>', help: 'cli.tribe.add.option.adapter' },
    'sibling-of': { type: 'string', value: '<root>', help: 'cli.tribe.add.option.sibling_of' },
    'max-concurrent': { type: 'string', value: '<n>', help: 'cli.tribe.add.option.max_concurrent' },
  },
  run: runAdd,
};
