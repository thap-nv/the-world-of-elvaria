// Which mana pool a character draws on (implementation-plan §3.5, ADR 0009). Mana is counted per pool, so one
// pool of an account running dry stops only the characters charged to it.
import { POOL_MODEL_PREFIXES } from './constants.ts';
import type { Character } from '../schema/character/character.ts';
import type { Tribe } from '../schema/tribe.ts';
import type { PoolKey } from '../world/mana-view.ts';

export type PoolId = string;

/**
 * The pool of a character on `model`: the tribe's own id for a one-pool account (`claude`), else the tribe's
 * named pool whose model prefixes match (`gemini-*` → `gemini_models`); a model no named pool claims is charged
 * to the tribe id, as a one-pool account would be.
 */
export function poolOf(tribe: Pick<Tribe, 'id' | 'pools'>, model: string): PoolId {
  if (tribe.pools === undefined) return tribe.id;
  const named = Object.keys(tribe.pools).find((pool) =>
    (POOL_MODEL_PREFIXES[pool] ?? []).some((prefix) => model.startsWith(prefix)),
  );
  return named ?? tribe.id;
}

/** The pool key of a character among the tribes of kingdom.json; a tribe it does not list is one pool. */
export function poolKeyOf(
  tribes: readonly Pick<Tribe, 'id' | 'pools'>[],
  character: Pick<Character, 'tribe' | 'model'>,
): PoolKey {
  const tribe = tribes.find(({ id }) => id === character.tribe);
  return {
    tribe: character.tribe,
    pool: tribe === undefined ? character.tribe : poolOf(tribe, character.model),
  };
}

/** A named pool the owner turned off (`claude_gpt_models` by default) gives its characters no work. */
export function poolEnabled(tribes: readonly Pick<Tribe, 'id' | 'pools'>[], key: PoolKey): boolean {
  const pools = tribes.find(({ id }) => id === key.tribe)?.pools;
  return pools?.[key.pool]?.enabled ?? true;
}

export const samePool = (a: PoolKey, b: PoolKey): boolean => a.tribe === b.tribe && a.pool === b.pool;
