// `elvaria tribe look <id> [--palette|--crest|--figure|--aura|--frame <id>] [--name <name>] [--reset]` (PS-24,
// implementation-plan §3.14): the tribe's look and where it comes from (the owner's choice, the theme's pinned entry,
// or drawn from the theme's pool by the id). With options it writes the owner's choice to kingdom.tribes[].look,
// on the path `tribe add` writes (save.ts): the look as it stands with the options laid over it, every part, so the
// tribe keeps it whatever the pool or the other tribes do later. A palette or a crest another tribe holds, or the
// theme pins to another tribe, is refused: two tribes would look alike. A sibling's look follows its root's, so only
// its name is the owner's to write (./look-sibling.ts, PS-27b). Display only (ADR 0025).
import {
  LOOK_PARTS,
  NameSchema,
  TELLING_PARTS,
  siblingRootOf,
  tribeLookOf,
  tribeLooksOf,
} from '@elvaria/domain';
import type { LookPart, Tribe, TribeLook, TribeLookChoice, TribeLookPool } from '@elvaria/domain';

import { flagOption, textOption } from '../args.ts';
import { EXIT } from '../command-table/command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { siblingLook } from './look-sibling.ts';
import { idsOf, kingdomPool, showLook } from './look-view.ts';
import { namedTribe, updateTribe } from './save.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command-table/command.ts';
import type { KingdomContext } from '../kingdom-context.ts';

interface LookRequest {
  readonly changes: Partial<Record<LookPart, string>>;
  readonly name: string | undefined;
  readonly reset: boolean;
}

const requestOf = (input: CommandInput): LookRequest => ({
  changes: Object.fromEntries(
    LOOK_PARTS.flatMap((part) => {
      const id = textOption(input, part);
      return id === undefined ? [] : [[part, id]];
    }),
  ),
  name: textOption(input, 'name'),
  reset: flagOption(input, 'reset') ?? false,
});

const isEmpty = (request: LookRequest) =>
  Object.keys(request.changes).length === 0 && request.name === undefined;

/** What is wrong with the command line itself: --reset with a change, a part the pool lacks, a bad name. */
function usageProblems(ctx: KingdomContext, pool: TribeLookPool, request: LookRequest): string[] {
  if (request.reset && !isEmpty(request)) return [ctx.t('cli.tribe.look.reset_alone')];
  const problems = LOOK_PARTS.flatMap((part) => {
    const id = request.changes[part];
    const ids = idsOf(pool, part);
    if (id === undefined || ids.includes(id)) return [];
    const params = { theme: pool.theme, part: ctx.t(`tribe_look.part.${part}`), id, ids: ids.join(', ') };
    return [ctx.t('cli.tribe.look.unknown_part', params)];
  });
  if (request.name !== undefined && !NameSchema.safeParse(request.name).success) {
    problems.push(ctx.t('cli.tribe.look.bad_name', { name: request.name }));
  }
  return problems;
}

/** Whether `look` is one of the tribe's siblings, which hold its palette and crest by design (PS-27b). */
const isSiblingOf = (tribe: Tribe, look: TribeLook): boolean =>
  look.siblings?.root === tribe.id && look.tribe !== tribe.id;

/** The tribe that holds, or that the theme pins, the palette or crest the owner asks for. */
function takenProblems(
  ctx: KingdomContext,
  pool: TribeLookPool,
  tribe: Tribe,
  request: LookRequest,
): string[] {
  const others = tribeLooksOf(pool, ctx.kingdom.tribes).filter(
    (look) => look.tribe !== tribe.id && !isSiblingOf(tribe, look),
  );
  const pinned = Object.entries(pool.pinned).filter(([id]) => id !== tribe.id);
  return TELLING_PARTS.flatMap((part) => {
    const id = request.changes[part];
    if (id === undefined) return [];
    const other =
      others.find((look) => look[part] === id)?.tribe ?? pinned.find(([, look]) => look[part] === id)?.[0];
    const params = { part: ctx.t(`tribe_look.part.${part}`), id, other: other ?? '' };
    return other === undefined ? [] : [ctx.t('cli.tribe.look.taken', params)];
  });
}

/** The owner's choice: the look as it stands, every part, with the request laid over it. */
function choiceOf(
  pool: TribeLookPool,
  tribes: readonly Tribe[],
  tribe: Tribe,
  request: LookRequest,
): TribeLookChoice {
  const look = tribeLookOf(pool, tribes, tribe.id);
  const name = request.name ?? look.name;
  const part = (which: LookPart) => request.changes[which] ?? look[which];
  return {
    palette: part('palette'),
    crest: part('crest'),
    figure: part('figure'),
    aura: part('aura'),
    frame: part('frame'),
    ...(name === undefined ? {} : { name }),
  };
}

/** Writes `look` of one tribe (undefined drops it), and returns the tribes as written, or undefined once refused. */
const writeLook = (
  ctx: KingdomContext,
  tribe: Tribe,
  look: TribeLookChoice | undefined,
): Promise<readonly Tribe[] | undefined> =>
  updateTribe(ctx, tribe.id, (entry) => {
    const { look: _dropped, ...rest } = entry;
    return look === undefined ? rest : { ...rest, look };
  });

/** The other tribes whose drawn look moved with the change, and the tribe's siblings, which follow it (PS-27b). */
function alsoChanged(ctx: KingdomContext, pool: TribeLookPool, tribe: Tribe, after: readonly Tribe[]): void {
  const before = new Map(
    tribeLooksOf(pool, ctx.kingdom.tribes).map((look) => [look.tribe, JSON.stringify(look)]),
  );
  const changed = tribeLooksOf(pool, after).filter(
    (look) => look.tribe !== tribe.id && before.get(look.tribe) !== JSON.stringify(look),
  );
  const moved = changed.filter((look) => !isSiblingOf(tribe, look)).map((look) => look.tribe);
  const follow = changed.filter((look) => isSiblingOf(tribe, look)).map((look) => look.tribe);
  if (moved.length > 0) ctx.io.out(ctx.t('cli.tribe.look.also_changed', { tribes: moved.join(', ') }));
  if (follow.length > 0)
    ctx.io.out(ctx.t('cli.tribe.look.siblings_follow', { tribe: tribe.id, tribes: follow.join(', ') }));
}

/** The owner's choice for a tribe that is no sibling: written whole, or dropped with --reset. */
async function writeChoice(
  ctx: KingdomContext,
  pool: TribeLookPool,
  tribe: Tribe,
  request: LookRequest,
): Promise<ExitCode> {
  if (request.reset && tribe.look === undefined) {
    ctx.io.out(ctx.t('cli.tribe.look.no_choice', { tribe: tribe.id }));
    return EXIT.ok;
  }
  const taken = takenProblems(ctx, pool, tribe, request);
  taken.forEach(ctx.io.err);
  if (taken.length > 0) return EXIT.failed;
  const look = request.reset ? undefined : choiceOf(pool, ctx.kingdom.tribes, tribe, request);
  const written = await writeLook(ctx, tribe, look);
  if (written === undefined) return EXIT.failed;
  ctx.io.out(
    ctx.t(request.reset ? 'cli.tribe.look.reset_done' : 'cli.tribe.look.saved', { tribe: tribe.id }),
  );
  alsoChanged(ctx, pool, tribe, written);
  showLook(ctx, pool, written, tribe.id);
  return EXIT.ok;
}

async function runLook(input: CommandInput, cli: CliContext): Promise<ExitCode> {
  const ctx = await openKingdomContext(input, cli);
  if (ctx === undefined) return EXIT.failed;
  const tribe = namedTribe(ctx, input.positionals[0]);
  const pool = tribe === undefined ? undefined : kingdomPool(ctx);
  if (tribe === undefined || pool === undefined) return EXIT.failed;
  const request = requestOf(input);
  const usage = usageProblems(ctx, pool, request);
  usage.forEach(ctx.io.err);
  if (usage.length > 0) return EXIT.usage;
  const root = siblingRootOf(ctx.kingdom.tribes, tribe);
  if (root !== undefined) {
    const parts = Object.keys(request.changes);
    return siblingLook(ctx, pool, { tribe, root }, { parts, name: request.name, reset: request.reset });
  }
  if (!request.reset && isEmpty(request)) {
    showLook(ctx, pool, ctx.kingdom.tribes, tribe.id);
    return EXIT.ok;
  }
  return writeChoice(ctx, pool, tribe, request);
}

export const TRIBE_LOOK: CommandSpec = {
  name: ['tribe', 'look'],
  summary: 'cli.tribe.look.summary',
  args: [{ name: '<id>', help: 'cli.tribe.arg.tribe' }],
  // One option per part of LOOK_PARTS, in its order.
  options: {
    palette: { type: 'string', value: '<id>', help: 'cli.tribe.look.option.palette' },
    crest: { type: 'string', value: '<id>', help: 'cli.tribe.look.option.crest' },
    figure: { type: 'string', value: '<id>', help: 'cli.tribe.look.option.figure' },
    aura: { type: 'string', value: '<id>', help: 'cli.tribe.look.option.aura' },
    frame: { type: 'string', value: '<id>', help: 'cli.tribe.look.option.frame' },
    name: { type: 'string', value: '<name>', help: 'cli.tribe.look.option.name' },
    reset: { type: 'boolean', help: 'cli.tribe.look.option.reset' },
  },
  run: runLook,
};
