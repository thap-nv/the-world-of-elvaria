// How a tribe looks in the world: its crest, mana colour and display name, theme data keyed by tribe id
// (implementation-plan §2.7, §3.14; ADR 0021). A tribe the owner added after the theme was made (Codex, an adapter
// file) has no entry yet: it gets the neutral crest and colour, and the world still runs.
import type { TribeId } from '../core/ids.ts';

/** One entry of a theme's `tribes.json` (themes/fantasy, stage 4). */
export interface TribeLook {
  /** Icon id: `tribe-silver`, `tribe-fire`, `tribe-neutral`. */
  readonly crest: string;
  /** A CSS custom property of the design system: `--elv-fac-silver`. */
  readonly color: string;
  /** i18n key of the tribe's display name; absent: the tribe id is shown. */
  readonly name_key?: string;
}

/** A theme's tribes, by tribe id. */
export type TribeLooks = Readonly<Partial<Record<TribeId, TribeLook>>>;

/** No theme entry: the neutral crest and the design system's secondary ink, the colour of every meta label. */
export const NEUTRAL_TRIBE_LOOK: TribeLook = { crest: 'tribe-neutral', color: '--elv-ink-2' };

/** The tribe's entry in the theme, or the neutral look until the theme has one. */
export function tribeLookOf(looks: TribeLooks, tribe: TribeId): TribeLook {
  return looks[tribe] ?? NEUTRAL_TRIBE_LOOK;
}
