// The model `elvaria tribe check` runs the conformance suite on when the owner names none (PS-23, settled by the owner
// on 2026-11-13 after fix/agy-1-5-7): the tribe's own, not one constant. Before, a tribe without `tool.default_model`
// was tried on `claude-haiku-5-5`, which agy refuses ("invalid model selection"), so `tribe check gemini` read 3/7 as
// a broken CLI. Pure: the CLI passes the kingdom's tribes and characters and the models the adapter declares.
import { startingLevelOf } from '../character/starting-level.ts';
import { poolEnabled, poolKeyOf } from '../mana/pool.ts';
import { modelEntryOf } from './models.ts';
import type { Character } from '../schema/character/character.ts';
import type { Tribe } from '../schema/tribe.ts';
import type { TribeModel } from './models.ts';

/** Where the model comes from: the tribe's pinned default, or a character of the tribe that runs it. */
export type CheckModel =
  | { readonly model: string; readonly from: 'default_model' }
  | { readonly model: string; readonly from: 'character'; readonly character: string };

/** A level above any, for a model of no known level: it comes after every model whose level is known. */
const UNKNOWN_LEVEL = Number.POSITIVE_INFINITY;

/**
 * The tribe's `tool.default_model`; else, of its characters not suspended whose pool is on (and whose model the
 * adapter serves, when it declares its models), the one whose model starts lowest, the cheapest the kingdom already
 * runs on that account; then by model and id, so the same files give the same model. undefined: none, the owner names
 * one.
 */
export function checkModelOf(
  tribe: Pick<Tribe, 'id' | 'tool'>,
  tribes: readonly Pick<Tribe, 'id' | 'pools'>[],
  characters: readonly Pick<Character, 'id' | 'tribe' | 'model' | 'status'>[],
  declared?: readonly TribeModel[],
): CheckModel | undefined {
  const pinned = tribe.tool?.default_model;
  if (pinned !== undefined) return { model: pinned, from: 'default_model' };
  const levelOf = (model: string): number => startingLevelOf(model, declared) ?? UNKNOWN_LEVEL;
  const [first] = characters
    .filter((character) => character.tribe === tribe.id && character.status !== 'suspended')
    .filter((character) => poolEnabled(tribes, poolKeyOf(tribes, character)))
    .filter(({ model }) => declared === undefined || modelEntryOf(declared, model) !== undefined)
    .toSorted(
      (a, b) =>
        levelOf(a.model) - levelOf(b.model) || a.model.localeCompare(b.model) || a.id.localeCompare(b.id),
    );
  return first === undefined ? undefined : { model: first.model, from: 'character', character: first.id };
}
