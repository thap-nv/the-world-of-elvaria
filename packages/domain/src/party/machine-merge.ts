// A party's merge quest starts as the machine's work (implementation-plan §2.5, §3.13; P1-18 proposal (h)): when every
// part merges cleanly a knight's session would change nothing, so the first run is the Steward's own, like a script's:
// claimed with no assignee, started, the parts merged into the plot, then submitted to the checks and a judge. A merge
// that stops on a conflict is released, and a judge's fail opens the quest again: either way a knight takes the next
// run, with the conflict or the verdict in front of it (ADR 0017: what a machine can do, it does).
import type { Quest } from '../schema/quest/quest.ts';

/**
 * The merge quest's first run, which the machine makes: open (or claimed for it) with no run ever started, the
 * machine's own included. `attempts` alone is not that: the machine's run does not count in it (P1-55), and the owner's
 * retry from the infirmary puts it back to 0 with the log of runs kept, so a retry would run the machine again on the
 * commit that just failed (P1-50, Q1-z).
 */
export const machineMergeDue = (
  quest: Pick<Quest, 'tier' | 'party_role' | 'attempts' | 'attempt_log'>,
): boolean =>
  quest.tier === 'session' &&
  quest.party_role === 'merge' &&
  quest.attempts === 0 &&
  quest.attempt_log.length === 0;

/**
 * A run of a session quest that no character holds: the Steward's merge of a party's parts. It is the machine's work,
 * not a try of the quest, so it does not count against `budget.max_attempts` (P1-55).
 */
export const machineRun = (quest: Pick<Quest, 'tier' | 'assignee'>): boolean =>
  quest.tier === 'session' && typeof quest.assignee !== 'string';
