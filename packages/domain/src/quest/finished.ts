// When a quest's work stands (implementation-plan §2.5, §3.13; P1-21 (a)): done, or done and archived since. A quest
// waiting for it may start, and a party counts it as finished. An archive without a delivery (cancelled, rejected,
// archived from the infirmary) is no work: what waited for it keeps waiting.
import type { Quest } from '../schema/quest/quest.ts';

export const questFinished = (quest: Pick<Quest, 'status' | 'deliverable'>): boolean =>
  quest.status === 'done' || (quest.status === 'archived' && quest.deliverable.delivered_at !== undefined);
