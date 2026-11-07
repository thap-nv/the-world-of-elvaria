// The kingdom as one tick sees it: read from the files at the start of the tick, then kept current by every
// write the tick makes, so later steps decide on what earlier steps did (implementation-plan §3.1).
import { tribeLimitsOf } from '@elvaria/domain';
import type {
  Character,
  CharacterId,
  HeldSession,
  Kingdom,
  KingdomSnapshot,
  Quest,
  QuestId,
  Registry,
  Territory,
  TerritoryId,
  TribeId,
  TribeLimits,
} from '@elvaria/domain';
import type { AgentRunner } from '@elvaria/runner-core';
import type { KingdomStore, Listing, StoreIssue } from '@elvaria/store';

import type { ManaBook } from './mana/book.ts';
import type { Logger } from './types.ts';

export interface World {
  readonly kingdom: Kingdom;
  readonly registry: Registry;
  readonly territories: ReadonlyMap<TerritoryId, Territory>;
  readonly quests: Map<QuestId, Quest>;
  readonly characters: Map<CharacterId, Character>;
}

export const describeIssue = (issue: StoreIssue): string => `${issue.file}: ${issue.code} (${issue.message})`;

function byId<T extends { readonly id: string }, Id extends string>(
  listing: Listing<T>,
  log: Logger,
): Map<Id, T> {
  for (const issue of listing.issues) log.warn(`steward: skipped ${describeIssue(issue)}`);
  // The store checked each id against its file name with the entity's id schema.
  return new Map(listing.items.map((item) => [item.id as Id, item]));
}

/** The files of the kingdom; undefined when kingdom.json or the registry cannot be read (nothing to decide on). */
export async function loadWorld(store: KingdomStore, log: Logger): Promise<World | undefined> {
  const kingdom = await store.kingdom.read();
  if (!kingdom.ok) {
    log.warn(`steward: cannot read kingdom.json: ${describeIssue(kingdom.error)}`);
    return undefined;
  }
  const registry = await store.loadRegistry();
  if (!registry.ok) {
    log.warn(`steward: cannot load the registry: ${registry.error.map(({ message }) => message).join('; ')}`);
    return undefined;
  }
  const [territories, quests, characters] = await Promise.all([
    store.territories.list(),
    store.quests.list(),
    store.characters.list(),
  ]);
  return {
    kingdom: kingdom.value,
    registry: registry.value,
    territories: byId(territories, log),
    quests: byId(quests, log),
    characters: byId(characters, log),
  };
}

/** What each tribe's runner allows (§3.14); a tribe without a runner has no entry and takes no work. */
export function limitsOf(
  runners: Readonly<Partial<Record<TribeId, AgentRunner>>>,
): Partial<Record<TribeId, TribeLimits>> {
  const limits: Partial<Record<TribeId, TribeLimits>> = {};
  for (const [tribe, runner] of Object.entries(runners)) {
    // Object.entries widens the TribeId keys to string.
    if (runner !== undefined) limits[tribe as TribeId] = tribeLimitsOf(runner.capabilities);
  }
  return limits;
}

/** The snapshot planTick decides on, with the pools asleep and the gauges' readings (§3.5). */
export const snapshotOf = (
  world: World,
  limits: Partial<Record<TribeId, TribeLimits>>,
  mana: Pick<ManaBook, 'asleep' | 'readings'>,
  sessions: readonly HeldSession[] = [],
): KingdomSnapshot => ({
  sessions,
  kingdom: world.kingdom,
  territories: [...world.territories.values()],
  registry: world.registry,
  quests: [...world.quests.values()],
  characters: [...world.characters.values()],
  asleep: mana.asleep,
  mana: { readings: mana.readings, config: world.kingdom.mana },
  limits,
});
