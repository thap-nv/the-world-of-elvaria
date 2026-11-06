// Invariants the v1 quest contract leaves open and the state machine keeps (implementation-plan §8, P0-04,
// settled after P0-03). The schema stays as reviewed; transition() refuses a quest that breaks them, and no row
// of QUEST_TRANSITIONS can produce one.
import type { Quest } from '../schema/quest/quest.ts';

/** English, for logs: what makes the tiers of `quest` inconsistent; empty when they hold. */
export function questTierIssues(quest: Pick<Quest, 'tier' | 'verifier' | 'script'>): string[] {
  return [
    // The machine judges a script: verdict.verifier_id is `machine`, never a character (ADR 0017).
    ...(quest.tier === 'script' && typeof quest.verifier === 'string'
      ? ['verifier: a script-tier quest is judged by the machine, never by a character']
      : []),
    // A catalog script runs only for tier = script; on a session quest it would be a second, silent plan.
    ...(quest.tier === 'session' && quest.script !== undefined
      ? ['script: a session-tier quest is done by a character, not by a catalog script']
      : []),
  ];
}
