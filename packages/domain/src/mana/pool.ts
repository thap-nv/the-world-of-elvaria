// Which mana gauges bind a character (implementation-plan §3.5, ADR 0009). Mana is counted per bucket the account
// reports (P1-22): a group of models with its own windows, or the cap of one model; a bucket running dry stops only
// the characters it binds. The pool of a model is what the account says it is; the prefix table is the fallback.
import { POOL_MODEL_PREFIXES } from './constants.ts';
import type { Character } from '../schema/character/character.ts';
import type { Tribe } from '../schema/tribe.ts';
import type { PoolKey } from '../world/mana-view.ts';

export type PoolId = string;

/**
 * The pool of a character on `model` by the prefix table: the tribe's own id for a one-pool account (`claude`),
 * else the tribe's named pool whose model prefixes match (`gemini-*` → `gemini_models`); a model no named pool
 * claims is charged to the tribe id, as a one-pool account would be.
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
export function poolEnabled(
  tribes: readonly Pick<Tribe, 'id' | 'pools'>[],
  key: Pick<PoolKey, 'tribe' | 'pool'>,
): boolean {
  const pools = tribes.find(({ id }) => id === key.tribe)?.pools;
  return pools?.[key.pool]?.enabled ?? true;
}

/** The same gauge: tribe, pool and the model whose cap it is (none for the whole pool). */
export const sameKey = (a: PoolKey, b: PoolKey): boolean =>
  a.tribe === b.tribe && a.pool === b.pool && a.model === b.model;

/** The key of a reading or of an event line: what sleeps and wakes. */
export const keyOf = ({ tribe, pool, model }: PoolKey): PoolKey => ({
  tribe,
  pool,
  ...(model === undefined ? {} : { model }),
});

/** The lower-case words of a model slug or of a model's name (`gemini-3.8-flash-high`, `Gemini Flash`). */
const wordsOf = (text: string): string[] => text.toLowerCase().split(/[\s-]+/);

/** Whether the account's name of a model (`Gemini Flash`, `GPT-OSS`) is the model of a slug: all its words in it. */
export function namesModel(name: string, model: string): boolean {
  const slug = wordsOf(model);
  return wordsOf(name).every((word) => slug.includes(word));
}

/** A gauge as it binds: its key, and the models the account says share it (absent when it does not say). */
export interface Gauge extends PoolKey {
  readonly models?: readonly string[];
}

/**
 * Whether `gauge` binds a character of `tribe` on `model` (§3.5, P1-22): a model's own cap binds the slugs that
 * name it; a group binds the models the account lists in it, or, when it lists none, the models the prefix table
 * charges to its pool (poolOf).
 */
export function binds(
  tribes: readonly Pick<Tribe, 'id' | 'pools'>[],
  gauge: Gauge,
  character: Pick<Character, 'tribe' | 'model'>,
): boolean {
  if (gauge.tribe !== character.tribe) return false;
  if (gauge.model !== undefined) return wordsOf(character.model).includes(gauge.model);
  if (gauge.models !== undefined) return gauge.models.some((name) => namesModel(name, character.model));
  return poolKeyOf(tribes, character).pool === gauge.pool;
}
