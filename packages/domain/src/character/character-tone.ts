// The design system draws a character's status with one of 6 icons (`c-*` in Icons.dc.html, implementation-plan
// §2.7); an idle character has none. The mapping is data here, so either side can change without renaming.
import type { CharacterStatus } from '../schema/character/character.ts';

/** The `c-*` icon names of the design (`c-sleeping` becomes `character-sleeping` when icons are generated). */
export const CHARACTER_TONES = [
  'working',
  'reviewing',
  'sleeping',
  'meditating',
  'suspended',
  'swamp',
] as const;
export type CharacterTone = (typeof CHARACTER_TONES)[number];

const TONE_OF: Readonly<Record<CharacterStatus, CharacterTone | null>> = {
  idle: null,
  working: 'working',
  reviewing: 'reviewing',
  sleeping_mana: 'sleeping',
  meditating: 'meditating',
  suspended: 'suspended',
  swamp: 'swamp',
};

/** The icon tone of a status; null for idle, which the design draws without an icon. */
export const characterToneOf = (status: CharacterStatus): CharacterTone | null => TONE_OF[status];
