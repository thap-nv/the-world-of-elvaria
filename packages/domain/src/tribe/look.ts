// How a tribe looks in the world (implementation-plan §2.7, §3.14; ADR 0021, 0025; PS-24): a set of parts from the
// theme's look pool. Its source, in order: the owner's choice (kingdom.tribes[].look), the theme's pinned entry for
// the tribe id, else a look drawn from the pool by the id. The draw walks each list from a start the id hashes to,
// in the order of kingdom.tribes[], past the parts other tribes hold: the same id gets the same look on every run,
// a tribe added last changes no other tribe's look, and any two tribes differ in palette and in crest while the
// pool lasts. Pinned palettes and crests, and those the owner chose, are held from the start, so no tribe draws
// them, wherever the tribe that has them stands in the list. Display only: no prompt and no dispatch reads it.
import { LOOK_PARTS, POOL_LISTS, TELLING_PARTS } from '../schema/tribe-look.ts';
import { LOOK_HASH_OFFSET, LOOK_HASH_PRIME, LOOK_TIERS } from './constants.ts';
import type { TribeId } from '../core/ids.ts';
import type { LookPart, LookParts, TribeLookChoice, TribeLookPool } from '../schema/tribe-look.ts';

export const LOOK_SOURCES = ['owner', 'pinned', 'generated'] as const;
export type LookSource = (typeof LOOK_SOURCES)[number];

export interface TribeLook extends LookParts {
  readonly tribe: TribeId;
  readonly source: LookSource;
  /** The owner's name for the tribe; absent: the theme's words for its crest and palette. */
  readonly name?: string;
  /** Parts of the owner's choice the pool lacks: the choice is set aside, and the tribe looks as without one. */
  readonly unknown?: readonly LookPart[];
}

/** What tribeLookOf reads of a kingdom.tribes[] entry. */
export interface LookedTribe {
  readonly id: TribeId;
  readonly look?: TribeLookChoice | undefined;
}

/** The parts the tribes walked so far hold, and the palette-crest pairs among them. */
interface Held {
  readonly parts: Readonly<Record<LookPart, Set<string>>>;
  readonly pairs: Set<string>;
}

const pairOf = (palette: string, crest: string): string => `${palette}+${crest}`;

const partsOf = (from: LookParts): LookParts => ({
  palette: from.palette,
  crest: from.crest,
  figure: from.figure,
  aura: from.aura,
  frame: from.frame,
});

/** Parts of a choice that are not in the pool. */
export const unknownLookParts = (pool: TribeLookPool, choice: LookParts): LookPart[] =>
  LOOK_PARTS.filter((part) => !pool[POOL_LISTS[part]].some(({ id }) => id === choice[part]));

/** 32-bit FNV-1a of the text's UTF-16 units (constants.ts says why not a library). */
function hashOf(text: string): number {
  let hash = LOOK_HASH_OFFSET;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), LOOK_HASH_PRIME) >>> 0;
  }
  return hash;
}

/** The entry of the lowest tier nearest after the start `key` hashes to, round the list once. */
function nearest(
  entries: readonly { readonly id: string }[],
  key: string,
  tierOf: (id: string) => number,
): string {
  const start = hashOf(key) % entries.length;
  // The schema keeps every list non-empty, so the first entry always replaces this.
  let best = { id: '', score: Infinity };
  for (const [index, { id }] of entries.entries()) {
    const score = tierOf(id) * entries.length + ((index - start + entries.length) % entries.length);
    if (score < best.score) best = { id, score };
  }
  return best.id;
}

function drawn(pool: TribeLookPool, tribe: TribeId, held: Held): LookParts {
  const heldTier =
    (part: LookPart) =>
    (id: string): number =>
      held.parts[part].has(id) ? LOOK_TIERS.held : LOOK_TIERS.free;
  const pick = (part: LookPart, tierOf = heldTier(part)) =>
    nearest(pool[POOL_LISTS[part]], `${part}:${tribe}`, tierOf);
  const palette = pick('palette');
  const crestTier = (id: string): number => {
    if (!held.parts.crest.has(id)) return LOOK_TIERS.free;
    return held.pairs.has(pairOf(palette, id)) ? LOOK_TIERS.pair_held : LOOK_TIERS.held;
  };
  return {
    palette,
    crest: pick('crest', crestTier),
    figure: pick('figure'),
    aura: pick('aura'),
    frame: pick('frame'),
  };
}

/** Held before any tribe is walked: every pinned palette and crest, and those of the owner's valid choices. */
function heldAtStart(pool: TribeLookPool, tribes: readonly LookedTribe[]): Held {
  const chosen = tribes.flatMap(({ look }) =>
    look === undefined || unknownLookParts(pool, look).length > 0 ? [] : [look],
  );
  const telling = [...Object.values(pool.pinned), ...chosen];
  const parts = Object.fromEntries(LOOK_PARTS.map((part) => [part, new Set<string>()])) as Held['parts'];
  for (const part of TELLING_PARTS) for (const look of telling) parts[part].add(look[part]);
  return { parts, pairs: new Set() };
}

function hold(held: Held, look: LookParts): void {
  for (const part of LOOK_PARTS) held.parts[part].add(look[part]);
  held.pairs.add(pairOf(look.palette, look.crest));
}

function lookOf(pool: TribeLookPool, tribe: LookedTribe, held: Held): TribeLook {
  const unknown = tribe.look === undefined ? [] : unknownLookParts(pool, tribe.look);
  if (tribe.look !== undefined && unknown.length === 0) {
    const { name } = tribe.look;
    return {
      tribe: tribe.id,
      ...partsOf(tribe.look),
      source: 'owner',
      ...(name === undefined ? {} : { name }),
    };
  }
  const pinned = pool.pinned[tribe.id];
  const base =
    pinned === undefined
      ? { ...drawn(pool, tribe.id, held), source: 'generated' as const }
      : { ...partsOf(pinned), source: 'pinned' as const };
  return { tribe: tribe.id, ...base, ...(unknown.length === 0 ? {} : { unknown }) };
}

/**
 * The look of `tribe` in a kingdom whose tribes are `tribes`, in their order. A tribe the list lacks (a character's
 * tribe removed by hand) looks as it would if added last: there is no neutral look shared by several tribes.
 */
export function tribeLookOf(pool: TribeLookPool, tribes: readonly LookedTribe[], tribe: TribeId): TribeLook {
  const own = tribes.find(({ id }) => id === tribe) ?? { id: tribe };
  const held = heldAtStart(pool, tribes);
  for (const other of tribes) {
    if (other === own) break;
    hold(held, lookOf(pool, other, held));
  }
  return lookOf(pool, own, held);
}

/** Every tribe's look, in the order of kingdom.tribes[]. */
export const tribeLooksOf = (pool: TribeLookPool, tribes: readonly LookedTribe[]): TribeLook[] =>
  tribes.map(({ id }) => tribeLookOf(pool, tribes, id));
