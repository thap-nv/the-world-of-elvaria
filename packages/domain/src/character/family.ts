// The model family a slug belongs to (implementation-plan §3.2, ADR 0008): the "other tribe" of principle 4 means
// another family of models, because one CLI serves several (Antigravity runs Claude, Gemini and GPT models).
// Derived, never stored (character schema). A tribe whose adapter declares its models (`capabilities.models`, PS-23)
// is read from that list; the table below is the fallback for an adapter that declares none.
import { modelEntryOf } from '../tribe/models.ts';
import type { Character } from '../schema/character/character.ts';
import type { TribeModels } from '../tribe/models.ts';

/** Each family and the first word of the slugs that belong to it. */
const MODEL_FAMILIES: readonly { readonly family: string; readonly heads: readonly string[] }[] = [
  { family: 'claude', heads: ['claude'] },
  { family: 'gemini', heads: ['gemini'] },
  { family: 'gpt', heads: ['gpt', 'codex', 'o1', 'o3', 'o4'] },
];

/**
 * `claude-opus-5-5` → `claude`, `gemini-4-argon-medium` → `gemini`, `gpt-oss-120b-medium` → `gpt`. A slug of no
 * known family is its own first word, so two models of an unknown maker still count as one family.
 */
export function familyOf(model: string): string {
  const [head = model] = model.split('-');
  return MODEL_FAMILIES.find(({ heads }) => heads.includes(head))?.family ?? head;
}

/**
 * The family of a character's model: from the models its tribe's adapter declares, when it declares some (PS-23);
 * else by the slug (familyOf). undefined: unknown, a model the adapter does not name or names without a family.
 */
export function familyOfCharacter(
  character: Pick<Character, 'tribe' | 'model'>,
  models: TribeModels = {},
): string | undefined {
  const declared = models[character.tribe];
  if (declared === undefined) return familyOf(character.model);
  return modelEntryOf(declared, character.model)?.family;
}

/**
 * Whether `family` is another family than each of `others`, as the separation of duties counts it (ADR 0008): an
 * unknown family on either side never is, since it may be the same maker's model. With nobody to compare with, it is.
 */
export const apartFromAll = (family: string | undefined, others: readonly (string | undefined)[]): boolean =>
  others.length === 0 ||
  (family !== undefined && others.every((other) => other !== undefined && other !== family));
