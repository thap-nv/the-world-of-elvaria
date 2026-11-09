// A party's merge quest starts as the machine's work (implementation-plan §2.5, §3.13; P1-18 proposal (h)): when every
// part merges cleanly a knight's session would change nothing, so the first run is the Steward's own, like a script's:
// claimed with no assignee, started, the parts merged into the plot, then submitted to the checks and a judge. A merge
// that stops on a conflict is released, and a judge's fail opens the quest again: either way a knight takes the next
// run, with the conflict or the verdict in front of it (ADR 0017: what a machine can do, it does).
import type { Quest } from '../schema/quest/quest.ts';

/** The merge quest's first run, which the machine makes: open (or claimed for it) with no attempt yet. */
export const machineMergeDue = (quest: Pick<Quest, 'tier' | 'party_role' | 'attempts'>): boolean =>
  quest.tier === 'session' && quest.party_role === 'merge' && quest.attempts === 0;
