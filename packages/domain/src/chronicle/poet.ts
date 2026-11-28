// Whether the Bard writes the day's prose (P2-06b, W10): a model call spends mana, so the machine decides first
// (ADR 0017). No call when the owner turned `schedule.chronicle.prose` off, when the day's ledger holds nothing to tell,
// when the roster has no Bard, when the first Bard's tribe is held by its CLI's version, or when its pool is closed:
// the machine's part of the chronicle stands alone. The first Bard only: the chronicle is one voice, and a pool asleep
// tonight is not a reason to spend another character's.
import { BARD_CLASS } from './constants.ts';
import type { CharacterId, TribeId } from '../core/ids.ts';
import type { ChronicleLedger } from '../schema/chronicle/ledger.ts';
import type { Character } from '../schema/character/character.ts';

export const POET_SKIPS = ['off', 'empty_day', 'no_bard', 'held', 'pool_closed'] as const;
export type PoetSkip = (typeof POET_SKIPS)[number];

export type PoetCall =
  | { readonly status: 'call'; readonly bard: CharacterId }
  | { readonly status: 'skip'; readonly reason: PoetSkip };

export interface PoetSource {
  /** `kingdom.schedule.chronicle.prose`. */
  readonly prose: boolean;
  readonly ledger: Pick<ChronicleLedger, 'entries'>;
  /** The kingdom's characters, in the roster's order. */
  readonly roster: readonly Pick<Character, 'id' | 'class' | 'tribe' | 'status'>[];
  /** The tribes held by their CLI's version (`tribes_held`). */
  readonly held: readonly TribeId[];
  /** The characters whose mana opens a session now (poolOpenOf). */
  readonly open: ReadonlySet<CharacterId>;
}

const skip = (reason: PoetSkip): PoetCall => ({ status: 'skip', reason });

/** The Bard who writes the prose, or why nobody does. */
export function poetCallOf(source: PoetSource): PoetCall {
  if (!source.prose) return skip('off');
  if (source.ledger.entries.length === 0) return skip('empty_day');
  const bard = source.roster.find(
    (character) => character.class === BARD_CLASS && character.status !== 'suspended',
  );
  if (bard === undefined) return skip('no_bard');
  if (source.held.includes(bard.tribe)) return skip('held');
  if (!source.open.has(bard.id)) return skip('pool_closed');
  return { status: 'call', bard: bard.id };
}
