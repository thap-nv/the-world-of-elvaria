// How the CLI shows a tribe's look (PS-24): the name the owner gave it, else the theme's words for its crest and
// palette (Sao Bạc, Silver Star), and its parts with their display names. The look comes from the domain
// (tribeLookOf); a part whose name the catalog lacks (a theme of the owner's) shows by its id. A sibling (PS-27b) is
// named by its sibling_name, else by its root's name with its Roman ordinal (Sao Bạc II); a root with siblings and no
// name of the owner's carries "I", one the owner named keeps the owner's words.
import {
  LOOK_PARTS,
  POOL_LISTS,
  TELLING_PARTS,
  lookPoolOf,
  romanOf,
  siblingRootOf,
  tribeLookOf,
  tribeLooksOf,
} from '@elvaria/domain';
import type { LookPart, LookedTribe, Tribe, TribeId, TribeLook, TribeLookPool } from '@elvaria/domain';
import { isMessageKey } from '@elvaria/i18n';
import type { Translate } from '@elvaria/i18n';

import type { KingdomContext } from '../kingdom-context.ts';

/** The display name of one part of the pool, or its id. */
export function partName(t: Translate, part: LookPart, id: string): string {
  const key = `tribe_look.${part}.${id}`;
  return isMessageKey(key) ? t(key) : id;
}

/** A tribe's look and, for a sibling, its root's, whose name the sibling's derives from. */
export interface LookView {
  readonly look: TribeLook;
  readonly root?: TribeLook;
}

/** The look of `tribe` among `tribes`, with its root's when it is a sibling. */
export function lookViewOf(pool: TribeLookPool, tribes: readonly LookedTribe[], tribe: TribeId): LookView {
  const look = tribeLookOf(pool, tribes, tribe);
  const root = look.siblings?.root;
  return root === undefined || root === tribe ? { look } : { look, root: tribeLookOf(pool, tribes, root) };
}

/** The theme's words for a look: its crest and palette. A sibling has its root's two. */
const themeNameOf = (t: Translate, look: TribeLook): string =>
  t('tribe_look.name', {
    crest: partName(t, 'crest', look.crest),
    palette: partName(t, 'palette', look.palette),
  });

/** The tribe's name as the owner reads it. */
export function lookNameOf(t: Translate, { look, root }: LookView): string {
  if (look.name !== undefined) return look.name;
  if (look.siblings === undefined) return themeNameOf(t, look);
  const name = root?.name ?? themeNameOf(t, look);
  return t('tribe_look.sibling_name', { name, numeral: romanOf(look.siblings.ordinal) });
}

/** The cell of `tribe list`: name, then the two parts that tell tribes apart. */
export const lookCellOf = (t: Translate, view: LookView): string =>
  `${lookNameOf(t, view)} (${view.look.palette}, ${view.look.crest})`;

/** The pool of the kingdom's theme, or undefined; `quiet` leaves the reason unprinted. */
export function kingdomPool(ctx: KingdomContext, quiet = false): TribeLookPool | undefined {
  const found = lookPoolOf(ctx.kingdom.theme);
  if (found.ok) return found.value;
  if (!quiet) ctx.io.err(ctx.t('cli.tribe.look.no_pool', { theme: ctx.kingdom.theme }));
  return undefined;
}

/** One line per part, the palette with its night and day colours. */
export function lookLines(t: Translate, pool: TribeLookPool, look: TribeLook): string[] {
  return LOOK_PARTS.map((part) => {
    const params = {
      part: t(`tribe_look.part.${part}`),
      id: look[part],
      name: partName(t, part, look[part]),
    };
    const palette = pool.palettes.find(({ id }) => id === look.palette);
    return part === 'palette' && palette !== undefined
      ? t('cli.tribe.look.palette', { ...params, night: palette.night, day: palette.day })
      : t('cli.tribe.look.part', params);
  });
}

export const idsOf = (pool: TribeLookPool, part: LookPart): string[] =>
  pool[POOL_LISTS[part]].map(({ id }) => id);

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

/**
 * What a change can be: for a tribe of its own, the free palettes and crests and the options; for a sibling, its
 * name only, its parts being its root's (PS-27b); a root names its siblings.
 */
function howLines(
  ctx: KingdomContext,
  pool: TribeLookPool,
  tribes: readonly Tribe[],
  look: TribeLook,
): string[] {
  const { tribe, siblings } = look;
  if (look.source === 'sibling')
    return [ctx.t('cli.tribe.look.sibling_how', { tribe, root: siblings?.root ?? '' })];
  const own = tribes.filter((row) => siblingRootOf(tribes, row)?.id === tribe).map(({ id }) => id);
  return [
    ...(own.length === 0 ? [] : [ctx.t('cli.tribe.look.siblings', { tribe, tribes: own.join(', ') })]),
    ...freeLines(ctx, pool, tribes),
    ctx.t('cli.tribe.look.how', { tribe }),
  ];
}

/** `tribe look <id>` without options: the name, where the look comes from, every part, and what can change. */
export function showLook(
  ctx: KingdomContext,
  pool: TribeLookPool,
  tribes: readonly Tribe[],
  tribe: TribeId,
): void {
  const view = lookViewOf(pool, tribes, tribe);
  const { look } = view;
  const at = { root: look.siblings?.root ?? '', numeral: romanOf(look.siblings?.ordinal ?? 1) };
  const source = ctx.t(`cli.tribe.look.source.${look.source}`, at);
  ctx.io.out(ctx.t('cli.tribe.look.heading', { tribe, name: lookNameOf(ctx.t, view), source }));
  lookLines(ctx.t, pool, look).forEach((line) => {
    ctx.io.out(`  ${line}`);
  });
  if (look.unknown !== undefined) {
    const parts = look.unknown.map(
      (part) => `${part} ${tribes.find(({ id }) => id === tribe)?.look?.[part] ?? ''}`,
    );
    ctx.io.err(ctx.t('cli.tribe.look.set_aside', { tribe, theme: pool.theme, parts: parts.join(', ') }));
  }
  howLines(ctx, pool, tribes, look).forEach(ctx.io.out);
}
