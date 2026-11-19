// Who speaks for the Temple (PS-12f, temple-first plan PS-12d "Việc ngoài nhịp"): the first character of an `is_monk`
// class that is not suspended and whose tribe works. Its tribe must not be held by its CLI's version; for the Steward's
// job it must also run no session now and draw on a pool whose mana opens one (JobView `busy`, `mana_open`): the
// Temple waits for a free tribe instead of holding one, as the triage does. `elvaria temple run` asks only the holds.
import { tribeLimitsOf } from '@elvaria/domain';
import type { Character, CharacterClass, CharacterId, Registry, TribeHold, TribeId } from '@elvaria/domain';
import type { AgentRunner } from '@elvaria/runner-core';

import type { Runners } from '../say/hearing.ts';

export interface Monk {
  readonly character: Character;
  readonly class: CharacterClass;
  readonly runner: AgentRunner;
}

export type MonkFound =
  | { readonly status: 'ready'; readonly monk: Monk }
  /** Every Monk who could speak is of a tribe held by its CLI's version. */
  | { readonly status: 'held'; readonly holds: readonly TribeHold[] }
  /** A Monk's tribe runs a session now, or its pool is closed: the Temple waits. */
  | { readonly status: 'waiting' }
  /** No character of a Monk's class that is not suspended and whose tribe works. */
  | { readonly status: 'none' };

/** What may hold a Monk back besides its tribe's version: the Steward's job knows, `elvaria temple run` does not. */
export interface MonkWaits {
  readonly holds: readonly TribeHold[];
  readonly busy?: ReadonlySet<TribeId>;
  readonly open?: ReadonlySet<CharacterId>;
}

/** The first Monk's class in the registry: what `character add` would take. */
export const monkClassOf = (registry: Registry): CharacterClass | undefined =>
  registry.classes.find(({ is_monk }) => is_monk);

export function monkOf(
  registry: Registry,
  characters: readonly Character[],
  runners: Runners,
  waits: MonkWaits,
): MonkFound {
  const classes = new Map(
    registry.classes.filter(({ is_monk }) => is_monk).map((entry) => [entry.id, entry]),
  );
  const monks = characters.flatMap((character) => {
    const characterClass = classes.get(character.class);
    const runner = runners[character.tribe];
    return character.status === 'suspended' || characterClass === undefined || runner === undefined
      ? []
      : [{ character, class: characterClass, runner }];
  });
  if (monks.length === 0) return { status: 'none' };
  const held = (monk: Monk) => waits.holds.find(({ tribe }) => tribe === monk.character.tribe);
  const free = monks.filter((monk) => held(monk) === undefined);
  if (free.length === 0) return { status: 'held', holds: monks.flatMap((monk) => held(monk) ?? []) };
  const ready = free.find(
    ({ character }) => waits.busy?.has(character.tribe) !== true && waits.open?.has(character.id) !== false,
  );
  return ready === undefined ? { status: 'waiting' } : { status: 'ready', monk: ready };
}

/** How the Monk's reply comes back: the CLI's JSON Schema flag, or JSON in its text (tribeLimitsOf). */
export const structuredOf = (runner: AgentRunner) => tribeLimitsOf(runner.capabilities).structured_output;
