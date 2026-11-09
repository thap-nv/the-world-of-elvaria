// `elvaria tribe add <id> --adapter <adapter> [--max-concurrent <n>]` (implementation-plan §3.14 step 1, ADR 0021):
// a new tribe in kingdom.tribes[], disabled. The owner then pins its CLI (`elvaria doctor`) and runs the conformance
// suite (`elvaria tribe check`), which enables it once it passes. No character, quest or other file changes: a tribe
// is an open id, and the characters of the new tribe are summoned afterwards (`elvaria character add --tribe`).
import { stat } from 'node:fs/promises';

import { TribeIdSchema, TribeSchema, err, ok } from '@elvaria/domain';
import type { Tribe } from '@elvaria/domain';

import { textOption } from '../args.ts';
import { EXIT } from '../command.ts';
import { ADAPTER_PROGRAMS } from '../doctor/locate-tool.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { adapterFilePath, isAdapterFile } from './adapter-file.ts';
import { refuse, saveTribes } from './save.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

const DEFAULT_MAX_CONCURRENT = 1;

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
  if (ADAPTER_PROGRAMS[adapter] !== undefined) return undefined;
  const builtIn = Object.keys(ADAPTER_PROGRAMS).join(', ');
  return ctx.t('cli.tribe.add.bad_adapter', { adapter, adapters: builtIn });
}

/** The tribe the command line describes, or undefined once the reason is printed. */
function tribeOf(input: CommandInput, cli: CliContext): Tribe | undefined {
  const id = TribeIdSchema.safeParse(input.positionals[0] ?? '');
  const max = Number(textOption(input, 'max-concurrent') ?? DEFAULT_MAX_CONCURRENT);
  const adapter = textOption(input, 'adapter') ?? '';
  const parsed = TribeSchema.safeParse({ id: id.data, adapter, enabled: false, max_concurrent: max });
  if (!id.success) cli.io.err(cli.t('cli.tribe.add.bad_id', { id: input.positionals[0] ?? '' }));
  else if (!parsed.success) cli.io.err(cli.t('cli.tribe.add.bad_tribe', { id: id.data, adapter, max }));
  return parsed.success ? parsed.data : undefined;
}

async function runAdd(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const tribe = tribeOf(input, cli);
  if (tribe === undefined) return EXIT.usage;
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const problem = await adapterProblem(ctx, tribe.adapter);
  if (problem !== undefined) {
    ctx.io.err(problem);
    return EXIT.failed;
  }
  const saved = await saveTribes(ctx, (tribes) =>
    tribes.some(({ id }) => id === tribe.id)
      ? err(refuse(ctx.t('cli.tribe.add.exists', { tribe: tribe.id })))
      : ok([...tribes, tribe]),
  );
  if (!saved) return EXIT.failed;
  ctx.io.out(ctx.t('cli.tribe.add.added', { tribe: tribe.id, adapter: tribe.adapter }));
  ctx.io.out(ctx.t('cli.tribe.add.next', { tribe: tribe.id }));
  return EXIT.ok;
}

export const TRIBE_ADD: CommandSpec = {
  name: ['tribe', 'add'],
  summary: 'cli.tribe.add.summary',
  args: [{ name: '<id>', help: 'cli.tribe.add.arg.id' }],
  options: {
    adapter: { type: 'string', value: '<adapter>', required: true, help: 'cli.tribe.add.option.adapter' },
    'max-concurrent': { type: 'string', value: '<n>', help: 'cli.tribe.add.option.max_concurrent' },
  },
  run: runAdd,
};
