// How a tribe looks (implementation-plan §2.7, §3.14; ADR 0021; PS-24): a set of parts, each an id in a theme's look
// pool, and the pool itself. Display only: no prompt and no choice of who works or judges reads it (ADR 0025).
import { z } from 'zod';

import { SLUG_PATTERN, TribeIdSchema } from '../core/ids.ts';
import { GENERATED_NOTE, NameSchema, rejectDuplicateIds } from './common.ts';

const describe = (description: string) => ({ description });

/** The parts a look is made of, in the order the CLI prints them. Palette and crest tell two tribes apart. */
export const LOOK_PARTS = ['palette', 'crest', 'figure', 'aura', 'frame'] as const;
export type LookPart = (typeof LOOK_PARTS)[number];

/** The two parts no two tribes share while the pool lasts. */
export const TELLING_PARTS = ['palette', 'crest'] as const satisfies readonly LookPart[];

/** A part's id in the pool: kebab-case like every icon and asset id (ADR 0014). */
const PartIdSchema = z.string().regex(SLUG_PATTERN);
/** A colour as the design system's tokens write one (elvaria.css). */
const HexColourSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const PARTS_SHAPE = {
  palette: PartIdSchema.meta(
    describe('Palette: the colour of the crest, the mana bar and the tint of the models.'),
  ),
  crest: PartIdSchema.meta(
    describe('Crest: the icon on the banner, the portrait and the mana bar (`crest-<id>`).'),
  ),
  figure: PartIdSchema.meta(
    describe('Figure: the body the characters of the tribe are built on; the class dresses it.'),
  ),
  aura: PartIdSchema.meta(describe("Aura: how the tribe's mana shows around its characters.")),
  frame: PartIdSchema.meta(
    describe('Portrait frame: the shape around a character of the tribe on the 2D screens.'),
  ),
};

export const TribeLookChoiceSchema = z
  .strictObject({
    ...PARTS_SHAPE,
    name: NameSchema.optional().meta(
      describe(
        "The tribe's display name, the owner's words like a character's name; absent: the theme's words for its crest and palette.",
      ),
    ),
  })
  .meta(
    describe(
      "The owner's choice of look (`elvaria tribe look`, PS-24), every part an id of the theme's look pool (tribe-looks.schema.json). Added after v1 and optional, so kingdom.json stays version 1. It wins over the theme's pinned entry; a part the pool lacks sets the whole choice aside. Absent: the theme's pinned entry for this tribe id, else a look drawn from the pool by the id. Display only: no prompt and no dispatch reads it (ADR 0025).",
    ),
  );

export type TribeLookChoice = z.infer<typeof TribeLookChoiceSchema>;
export type LookParts = Readonly<Record<LookPart, string>>;

const PaletteSchema = z.strictObject({
  id: PartIdSchema,
  night: HexColourSchema.meta(describe('The colour on the night theme: light, on the dark background.')),
  day: HexColourSchema.meta(describe('The colour on the day theme: dark, on the parchment background.')),
});

export type LookPalette = z.infer<typeof PaletteSchema>;

const PartSchema = z.strictObject({ id: PartIdSchema });
const listOf = <T extends z.ZodType<{ id: string }>>(entry: T) =>
  z.array(entry).min(1).superRefine(rejectDuplicateIds);

/** The pool's list of each part. */
export const POOL_LISTS = {
  palette: 'palettes',
  crest: 'crests',
  figure: 'figures',
  aura: 'auras',
  frame: 'frames',
} as const satisfies Record<LookPart, string>;

interface PoolShape {
  readonly palettes: readonly { readonly id: string }[];
  readonly crests: readonly { readonly id: string }[];
  readonly figures: readonly { readonly id: string }[];
  readonly auras: readonly { readonly id: string }[];
  readonly frames: readonly { readonly id: string }[];
  readonly pinned: Readonly<Record<string, LookParts>>;
}

/** Pinned entries name parts of the pool, and no two of them share a palette or a crest. */
function checkPinned(pool: PoolShape, ctx: z.RefinementCtx): void {
  const held = { palette: new Map<string, string>(), crest: new Map<string, string>() };
  for (const [tribe, parts] of Object.entries(pool.pinned)) {
    for (const part of LOOK_PARTS) {
      if (!pool[POOL_LISTS[part]].some(({ id }) => id === parts[part])) {
        const message = `no ${part} "${parts[part]}" in the pool`;
        ctx.addIssue({ code: 'custom', path: ['pinned', tribe, part], message });
      }
    }
    for (const part of TELLING_PARTS) {
      const other = held[part].get(parts[part]);
      if (other !== undefined) {
        const message = `${part} "${parts[part]}" is pinned to ${other} already`;
        ctx.addIssue({ code: 'custom', path: ['pinned', tribe, part], message });
      }
      held[part].set(parts[part], tribe);
    }
  }
}

export const TribeLookPoolSchema = z
  .strictObject({
    version: z.literal(1),
    theme: z
      .string()
      .regex(/^[a-z][a-z0-9-]*$/)
      .meta(describe('The theme this pool belongs to, as kingdom.theme names it.')),
    palettes: listOf(PaletteSchema),
    crests: listOf(PartSchema),
    figures: listOf(PartSchema),
    auras: listOf(PartSchema),
    frames: listOf(PartSchema),
    pinned: z
      .record(TribeIdSchema, z.strictObject(PARTS_SHAPE))
      .meta(
        describe(
          "The theme's own look for a tribe id it knows (fantasy: claude the Silver Star, gemini the Red Fire). Their palettes and crests are never drawn for another tribe, so adding one of these tribes later changes no look.",
        ),
      ),
  })
  .superRefine(checkPinned)
  .meta({
    title: 'Tribe look pool',
    description:
      "A theme's pool of tribe looks (PS-24; implementation-plan §2.7, §3.14): the parts a look is made of, and the looks the theme pins to tribe ids. A tribe looks as the owner chose (kingdom.tribes[].look), else as pinned, else as tribeLookOf draws it: the same parts for the same id on every run, in the order of kingdom.tribes[], skipping the palettes and crests other tribes hold, so any two tribes differ in both while the pool lasts. Part names are display strings (i18n `tribe_look.<part>.<id>`).",
    $comment: `${GENERATED_NOTE} The domain's spec holds every palette of the default pool to the design system's tokens: contrast on the night and day backgrounds, and distance from the quest status colours and from each other.`,
  });

export type TribeLookPool = z.infer<typeof TribeLookPoolSchema>;
