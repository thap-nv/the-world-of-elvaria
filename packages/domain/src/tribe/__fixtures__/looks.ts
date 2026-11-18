// The fantasy pool and the kingdoms the look specs walk (PS-24, PS-27b).
import { TribeIdSchema } from '../../core/ids.ts';
import { lookPoolOf } from '../look-pools.ts';
import type { TribeId } from '../../core/ids.ts';
import type { TribeLookChoice } from '../../schema/tribe-look.ts';
import type { LookedTribe, TribeLook } from '../look.ts';

const found = lookPoolOf('fantasy');
if (!found.ok) throw new Error('the fantasy pool does not parse: look-pools.spec.ts says why');
export const FANTASY = found.value;

export const id = (text: string): TribeId => TribeIdSchema.parse(text);
export const plain = (...ids: string[]): LookedTribe[] => ids.map((text) => ({ id: id(text) }));
export const partsOf = (look: TribeLook) =>
  [look.palette, look.crest, look.figure, look.aura, look.frame].join('/');

/** Eight tribes the owner might add, in a few orders and mixes. */
export const NEWCOMERS = [
  ['codex', 'grok', 'cursor', 'kiro', 'aider', 'qwen', 'mistral', 'llama'],
  ['llama', 'mistral', 'qwen', 'aider', 'kiro', 'cursor', 'grok', 'codex'],
  ['tribe_1', 'tribe_2', 'tribe_3', 'tribe_4', 'tribe_5', 'tribe_6', 'tribe_7', 'tribe_8'],
  ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
  ['local', 'mine', 'work', 'home', 'lab', 'night', 'day', 'spare'],
];

export const VIOLET_MOON: TribeLookChoice = {
  palette: 'violet',
  crest: 'moon',
  figure: 'tall',
  aura: 'mist',
  frame: 'arch',
};
