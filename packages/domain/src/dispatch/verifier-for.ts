// Who verifies a submitted session-tier quest, in the plain form the Steward uses until selectVerifier (P1-04,
// implementation-plan §3.2) replaces it: a free character of a verifier class for the quest's kind who never worked
// on the quest and runs another model than the assignee; another tribe first, then the one idle the longest.
// The sandbox made the same choice since P0-10 (ADR 0008).
import { byIdleSince } from './roster.ts';
import type { Character } from '../schema/character/character.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { CharacterClass } from '../schema/registry-entries.ts';

/**
 * Everyone who ever worked the quest as assignee, the current one included (a submitted quest's assignee has run
 * a session): none of them judges it (ADR 0008).
 */
const pastAssigneesOf = (quest: Quest): Set<string | null> =>
  new Set(quest.attempt_log.filter(({ role }) => role === 'assignee').map(({ character }) => character));

/**
 * `free`: characters free for a session now; `assignee`: the assignee's file, if it still exists. Undefined when
 * nobody fits: the quest waits in review for the next tick.
 */
export function verifierFor(
  quest: Quest,
  free: readonly Character[],
  assignee: Character | undefined,
  classes: readonly Pick<CharacterClass, 'id' | 'is_verifier' | 'kinds'>[],
): Character | undefined {
  const judges = new Set(
    classes.filter(({ is_verifier, kinds }) => is_verifier && kinds.includes(quest.kind)).map(({ id }) => id),
  );
  const past = pastAssigneesOf(quest);
  const fit = free
    .filter(
      (character) =>
        judges.has(character.class) && !past.has(character.id) && character.model !== assignee?.model,
    )
    .toSorted(byIdleSince);
  return fit.find(({ tribe }) => tribe !== assignee?.tribe) ?? fit[0];
}
