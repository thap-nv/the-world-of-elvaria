// The models a tribe's adapter says its CLI serves, with the maker family of each (implementation-plan §3.14,
// ADR 0021 as amended for PS-23): a CLI that runs several makers' models under names of its own (Cursor, Kiro) would
// put a judge into the wrong family by the first word of the slug, and the separation of duties would call a judge of
// the same family another one (ADR 0008). Declared once per adapter and CLI version, never stored in the kingdom; the
// Steward hands the lists to planTick beside the tribes' limits. Pure.
import { CHARACTER_LEVEL_MAX } from '../schema/character/constants.ts';
import type { TribeId } from '../core/ids.ts';

/**
 * One entry of `capabilities.models`: `id` names a model, or the head of several (`gpt` serves `gpt-6.1-sol-low`); a
 * slug is served by the longest id it equals or starts with followed by `-`, so a reasoning suffix (`-low`) needs no
 * entry of its own. `family` is the maker's family (`claude`, `gemini`, `gpt`); absent, the family is unknown (an
 * automatic chooser that may pick any maker's model), which never counts as another family. `starting_level` is the
 * level a character summoned on it starts at when the owner gives none (§2.6).
 */
export interface TribeModel {
  readonly id: string;
  readonly family?: string;
  readonly starting_level?: number;
}

/** The declared models of each tribe whose adapter declares some; a tribe absent declares none (familyOf decides). */
export type TribeModels = Readonly<Partial<Record<TribeId, readonly TribeModel[]>>>;

/** The entry that serves `model`: the longest id equal to it or followed by `-` in it; undefined when none does. */
export function modelEntryOf(models: readonly TribeModel[], model: string): TribeModel | undefined {
  const serving = models.filter(({ id }) => model === id || model.startsWith(`${id}-`));
  return serving.reduce<TribeModel | undefined>(
    (best, entry) => (best === undefined || entry.id.length > best.id.length ? entry : best),
    undefined,
  );
}

/** The ModelSlugSchema shape, and a family's: lower-case words joined by `-`, `_` or `.`. */
const MODEL_ID = /^[a-z0-9][a-z0-9.-]*$/;
const FAMILY = /^[a-z][a-z0-9_.-]*$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function entryProblems(entry: unknown, index: number): string[] {
  const at = `capability models[${String(index)}]`;
  if (!isRecord(entry)) return [`${at} is not an object`];
  const { id, family, starting_level: level } = entry;
  return [
    ...(typeof id === 'string' && MODEL_ID.test(id) ? [] : [`${at}.id is not a model slug`]),
    ...(family === undefined || (typeof family === 'string' && FAMILY.test(family))
      ? []
      : [`${at}.family is not a lower-case family id`]),
    ...(level === undefined ||
    (typeof level === 'number' && Number.isInteger(level) && level >= 1 && level <= CHARACTER_LEVEL_MAX)
      ? []
      : [`${at}.starting_level is not a level from 1 to ${String(CHARACTER_LEVEL_MAX)}`]),
  ];
}

/**
 * What is wrong with `capabilities.models` (PS-23): optional, so an adapter written before it still passes; when
 * given, a non-empty list of entries with distinct ids. The kit and the conformance suite both ask.
 */
export function modelsProblems(models: unknown): string[] {
  if (models === undefined) return [];
  if (!Array.isArray(models) || models.length === 0) return ['capability models is not a non-empty list'];
  const ids = models.map((entry: unknown) => (isRecord(entry) ? entry.id : undefined));
  const twice = ids.filter((id, index) => typeof id === 'string' && ids.indexOf(id) !== index);
  return [
    ...models.flatMap(entryProblems),
    ...twice.map((id) => `capability models names ${String(id)} twice`),
  ];
}
