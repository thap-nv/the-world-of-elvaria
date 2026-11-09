// The exclusive lock of a territory, held by the Steward for a judge in its scratch plot (P1-20, ADR 0022 amended):
// the judge runs the territory's e2e and Docker checks while it breaks what they guard, so no other quest's exclusive
// check may run meanwhile. It is taken without waiting before the judge opens (busy: the judge opens in a later tick),
// kept across ticks, and released when the judge's session ends, whatever the end; a tick releases the lock of a quest
// that no longer has a judge's session (killed, cancelled), and stop() releases them all.
import { acquireLock } from '@elvaria/store';
import type { QuestId } from '@elvaria/domain';
import type { HeldLock } from '@elvaria/store';

import type { Logger } from '../types.ts';

export interface JudgeLocks {
  /** Holds `target` for the judge of `quest`: true when held now or already; false when another holds it, said once. */
  hold(quest: QuestId, target: string, territory: string): Promise<boolean>;
  release(quest: QuestId): Promise<void>;
  /** Releases the lock of every quest `keep` no longer wants. */
  sweep(keep: (quest: QuestId) => boolean): Promise<void>;
  releaseAll(): Promise<void>;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function createJudgeLocks(log: Logger): JudgeLocks {
  const held = new Map<QuestId, HeldLock>();
  /** Quests whose judge waits for the lock: the log says so once. */
  const waiting = new Set<QuestId>();
  const release = async (quest: QuestId): Promise<void> => {
    const lock = held.get(quest);
    held.delete(quest);
    waiting.delete(quest);
    if (lock === undefined) return;
    try {
      await lock.release();
    } catch (error) {
      log.warn(`steward: ${quest}: the exclusive lock was not released: ${messageOf(error)}`);
    }
  };
  return {
    hold: async (quest, target, territory) => {
      if (held.has(quest)) return true;
      const taken = await acquireLock(target, { wait: false });
      if (taken.ok) {
        held.set(quest, taken.value);
        waiting.delete(quest);
        return true;
      }
      if (!waiting.has(quest))
        log.warn(`steward: ${quest}: its judge waits for the exclusive checks of ${territory}`);
      waiting.add(quest);
      return false;
    },
    release,
    sweep: async (keep) => {
      for (const quest of [...held.keys()]) if (!keep(quest)) await release(quest);
    },
    releaseAll: async () => {
      for (const quest of [...held.keys()]) await release(quest);
    },
  };
}
