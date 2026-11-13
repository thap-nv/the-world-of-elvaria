// How the CLI shows a tribe's look (PS-24): the name the owner gave it, else the theme's words for its crest and
// palette (Sao Bạc, Silver Star), and its parts with their display names. The look comes from the domain
// (tribeLookOf); a part whose name the catalog lacks (a theme of the owner's) shows by its id.
import { LOOK_PARTS, lookPoolOf } from '@elvaria/domain';
import type { LookPart, TribeLook, TribeLookPool } from '@elvaria/domain';
import { isMessageKey } from '@elvaria/i18n';
import type { Translate } from '@elvaria/i18n';

import type { KingdomContext } from '../kingdom-context.ts';

/** The display name of one part of the pool, or its id. */
export function partName(t: Translate, part: LookPart, id: string): string {
  const key = `tribe_look.${part}.${id}`;
  return isMessageKey(key) ? t(key) : id;
}

/** The tribe's name as the owner reads it. */
export const lookNameOf = (t: Translate, look: TribeLook): string =>
  look.name ??
  t('tribe_look.name', {
    crest: partName(t, 'crest', look.crest),
    palette: partName(t, 'palette', look.palette),
  });

/** The cell of `tribe list`: name, then the two parts that tell tribes apart. */
export const lookCellOf = (t: Translate, look: TribeLook): string =>
  `${lookNameOf(t, look)} (${look.palette}, ${look.crest})`;

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
