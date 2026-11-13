// `elvaria tribe look <id> [--palette|--crest|--figure|--aura|--frame <id>] [--name <name>] [--reset]` (PS-24,
// implementation-plan §3.14): the tribe's look and where it comes from (the owner's choice, the theme's pinned entry,
// or drawn from the theme's pool by the id). With options it writes the owner's choice to kingdom.tribes[].look,
// on the path `tribe add` writes (save.ts): the look as it stands with the options laid over it, every part, so the
// tribe keeps it whatever the pool or the other tribes do later. A palette or a crest another tribe holds, or the
// theme pins to another tribe, is refused: two tribes would look alike. Display only (ADR 0025).
import {
  LOOK_PARTS,
  NameSchema,
  POOL_LISTS,
  TELLING_PARTS,
  err,
  ok,
  tribeLookOf,
  tribeLooksOf,
} from '@elvaria/domain';
import type { LookPart, Tribe, TribeLookChoice, TribeLookPool } from '@elvaria/domain';

import { flagOption, textOption } from '../args.ts';
import { EXIT } from '../command.ts';
import { openKingdomContext } from '../kingdom-context.ts';
import { kingdomPool, lookLines, lookNameOf } from './look-view.ts';
import { namedTribe, refuse, saveTribes } from './save.ts';
import type { CliContext, CommandInput, CommandSpec, ExitCode } from '../command.ts';
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

const idsOf = (pool: TribeLookPool, part: LookPart): string[] => pool[POOL_LISTS[part]].map(({ id }) => id);

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

/** The tribe that holds, or that the theme pins, the palette or crest the owner asks for. */
function takenProblems(
  ctx: KingdomContext,
  pool: TribeLookPool,
  tribe: Tribe,
  request: LookRequest,
): string[] {
  const others = tribeLooksOf(pool, ctx.kingdom.tribes).filter((look) => look.tribe !== tribe.id);
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

/** The palettes and crests no tribe of the kingdom holds and the theme pins to none. */
function freeLines(ctx: KingdomContext, pool: TribeLookPool, tribes: readonly Tribe[]): string[] {
  const looks = tribeLooksOf(pool, tribes);
  const pinned = Object.values(pool.pinned);
  return TELLING_PARTS.flatMap((part) => {
    const held = new Set([...looks, ...pinned].map((look) => look[part]));
    const free = idsOf(pool, part).filter((id) => !held.has(id));
    return free.length === 0
      ? []
      : [ctx.t('cli.tribe.look.free', { part: ctx.t(`tribe_look.part.${part}`), ids: free.join(', ') })];
  });
}

function showLook(
  ctx: KingdomContext,
  pool: TribeLookPool,
  tribes: readonly Tribe[],
  tribe: Tribe['id'],
): void {
  const look = tribeLookOf(pool, tribes, tribe);
  const source = ctx.t(`cli.tribe.look.source.${look.source}`);
  ctx.io.out(ctx.t('cli.tribe.look.heading', { tribe, name: lookNameOf(ctx.t, look), source }));
  lookLines(ctx.t, pool, look).forEach((line) => {
    ctx.io.out(`  ${line}`);
  });
  if (look.unknown !== undefined) {
    const parts = look.unknown.map(
      (part) => `${part} ${tribes.find(({ id }) => id === tribe)?.look?.[part] ?? ''}`,
    );
    ctx.io.err(ctx.t('cli.tribe.look.set_aside', { tribe, theme: pool.theme, parts: parts.join(', ') }));
  }
  freeLines(ctx, pool, tribes).forEach(ctx.io.out);
  ctx.io.out(ctx.t('cli.tribe.look.how', { tribe }));
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
async function writeLook(
  ctx: KingdomContext,
  tribe: Tribe,
  look: TribeLookChoice | undefined,
): Promise<readonly Tribe[] | undefined> {
  let written: readonly Tribe[] | undefined;
  const saved = await saveTribes(ctx, (tribes) => {
    if (!tribes.some(({ id }) => id === tribe.id)) {
      const known = tribes.map(({ id }) => id).join(', ');
      return err(refuse(ctx.t('cli.tribe.unknown', { tribe: tribe.id, tribes: known })));
    }
    const next = tribes.map((entry) => {
      if (entry.id !== tribe.id) return entry;
      const { look: _dropped, ...rest } = entry;
      return look === undefined ? rest : { ...rest, look };
    });
    written = next;
    return ok(next);
  });
  return saved ? written : undefined;
}

/** The other tribes whose drawn look moved with the change. */
function alsoChanged(ctx: KingdomContext, pool: TribeLookPool, tribe: Tribe, after: readonly Tribe[]): void {
  const before = new Map(
    tribeLooksOf(pool, ctx.kingdom.tribes).map((look) => [look.tribe, JSON.stringify(look)]),
  );
  const moved = tribeLooksOf(pool, after)
    .filter((look) => look.tribe !== tribe.id && before.get(look.tribe) !== JSON.stringify(look))
    .map((look) => look.tribe);
  if (moved.length > 0) ctx.io.out(ctx.t('cli.tribe.look.also_changed', { tribes: moved.join(', ') }));
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
  if (!request.reset && isEmpty(request)) {
    showLook(ctx, pool, ctx.kingdom.tribes, tribe.id);
    return EXIT.ok;
  }
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
