// What the owner's attention queue and the world state are built from (P2-04 attentionOf, worldStateOf): the kingdom's
// files as the store reads them and its whole log. `elvaria digest` and the Herald read it here rather than each
// keeping a copy (rule R7: IO of the kingdom folder lives in the store; P2-01c, §11 (627)(c)). A file that does not
// parse is left out, as the Steward leaves it out; `elvaria doctor` says why.
import { openEventLog } from '@elvaria/eventlog';
import type { AttentionSource, Campaign, Kingdom, Registry } from '@elvaria/domain';
import type { EventCursor } from '@elvaria/eventlog';

import type { KingdomStore } from '../kingdom-store.ts';

/** The files of AttentionSource, and the campaigns the world state shows. */
export interface KingdomFiles extends Omit<AttentionSource, 'kingdom' | 'events'> {
  readonly campaigns: readonly Campaign[];
}

/** The files and the log, and where to read the log from next. */
export interface KingdomSource extends AttentionSource, KingdomFiles {
  readonly cursor: EventCursor;
}

/** A registry that cannot be read names no class: the items say the kingdom has none, and `doctor` says why. */
const NO_REGISTRY: Pick<Registry, 'classes' | 'kinds' | 'rituals'> = { classes: [], kinds: [], rituals: [] };

/** The kingdom's files, each list without the files that do not parse. */
export async function readKingdomFiles(store: KingdomStore): Promise<KingdomFiles> {
  const [territories, characters, quests, campaigns, memos, verdicts, registry] = await Promise.all([
    store.territories.list(),
    store.characters.list(),
    store.quests.list(),
    store.campaigns.list(),
    store.memos.list(),
    store.verdicts.list(),
    store.loadRegistry(),
  ]);
  return {
    territories: territories.items,
    characters: characters.items,
    quests: quests.items,
    campaigns: campaigns.items,
    memos: memos.items,
    verdicts: verdicts.items,
    registry: registry.ok ? registry.value : NO_REGISTRY,
  };
}

/** The files of the kingdom `kingdom` describes and its whole log, or its sandbox's (`events/sandbox/`). */
export async function readKingdomSource(
  store: KingdomStore,
  kingdom: Kingdom,
  options: { readonly sandbox?: boolean } = {},
): Promise<KingdomSource> {
  const [files, log] = await Promise.all([readKingdomFiles(store), openEventLog(store.root, options).read()]);
  return { kingdom, ...files, events: log.events, cursor: log.cursor };
}
