// The world as the Herald streams it (wave-1 plan P2-01c): the kingdom's files read through the store, the state
// built by the domain's worldStateWithManaOf (worldStateOf, mana from the log), then each new batch of the log
// reduced into it, the way the world client reduces the lines it receives (P0-09). The log is read from the cursor
// at every pulse; a line that does not parse is skipped, as the Steward skips it. The owner's attention queue
// (P2-04) is rebuilt after a batch from the files read again and the whole log, which the feed keeps.
import { attentionOf, reduce, worldStateWithManaOf } from '@elvaria/domain';
import type { AttentionItem, Clock, Event, Kingdom, WorldState } from '@elvaria/domain';
import { openEventLog } from '@elvaria/eventlog';
import { readKingdomFiles, readKingdomSource } from '@elvaria/store';
import type { KingdomFiles, KingdomStore } from '@elvaria/store';

export interface FeedDeps {
  readonly store: KingdomStore;
  readonly kingdom: Kingdom;
  /** Streams the sandbox's log (`events/sandbox/`) and marks the state `sandbox` (a fake day, P0-10). */
  readonly sandbox: boolean;
  readonly clock: Clock;
}

/** What the feed knows now. */
export interface FeedView {
  readonly state: WorldState;
  readonly attention: readonly AttentionItem[];
  readonly registry: KingdomFiles['registry'];
}

/** New lines of the log and the state around them. */
export interface FeedBatch {
  /** The state the lines were read after: scopeEvents judges each line from it. */
  readonly before: WorldState;
  readonly events: readonly Event[];
  /** The attention queue changed with these lines. */
  readonly attentionChanged: boolean;
}

export interface WorldFeed {
  view(): FeedView;
  /** Reads the log from where it stopped; undefined when no line came. */
  poll(): Promise<FeedBatch | undefined>;
}

const sameItems = (a: readonly AttentionItem[], b: readonly AttentionItem[]): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

export async function openWorldFeed(deps: FeedDeps): Promise<WorldFeed> {
  const { store, kingdom, sandbox, clock } = deps;
  const log = openEventLog(store.root, { sandbox });
  const source = await readKingdomSource(store, kingdom, { sandbox });
  let cursor = source.cursor;
  const events: Event[] = [...source.events];
  let files: KingdomFiles = source;
  const attentionNow = (): AttentionItem[] => attentionOf({ kingdom, ...files, events }, clock.now());
  let state = worldStateWithManaOf({ kingdom, ...files, sandbox }, events);
  let attention = attentionNow();
  return {
    view: () => ({ state, attention, registry: files.registry }),
    poll: async () => {
      const batch = await log.read(cursor);
      if (batch.events.length === 0) {
        cursor = batch.cursor;
        return undefined;
      }
      const read = await readKingdomFiles(store);
      // Nothing awaits from here to the streams (stream.ts): one that opens meanwhile sees the state before these
      // lines and then gets them, or the state after them and not the lines; never both.
      cursor = batch.cursor;
      const before = state;
      state = reduce(state, batch.events);
      events.push(...batch.events);
      files = read;
      const next = attentionNow();
      const attentionChanged = !sameItems(next, attention);
      attention = next;
      return { before, events: batch.events, attentionChanged };
    },
  };
}
