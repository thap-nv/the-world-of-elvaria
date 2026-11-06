// What a verdict does to the assignee's file (implementation-plan §2.6, §3.13), as the Steward will do it in P1-03:
// one entry in the reputation window and in the window of each of the quest's tags, the last 20 kept; then the
// level moves when levelChange says so, with a character.level_up or level_down line of its own.
import { CharacterSchema, VERDICT_WINDOW_MAX, levelChange } from '@elvaria/domain';
import type { CharacterId, Quest, VerdictEntry, VerdictId } from '@elvaria/domain';

import type { Day } from './day.ts';
import type { Edit } from './ledger.ts';

const kept = (window: readonly VerdictEntry[], entry: VerdictEntry): VerdictEntry[] =>
  [...window, entry].slice(-VERDICT_WINDOW_MAX);

/** The verdict on run `n` of the quest, as verdict ids name it (`<quest>-<n>`, §2.1). */
export const verdictIdOf = (quest: Quest, run: number): VerdictId => `${quest.id}-${run}` as VerdictId;

export const judged =
  (quest: Quest, verdict: VerdictId, result: 'pass' | 'fail', byHuman = false): Edit =>
  (character, at) => {
    const entry: VerdictEntry = { verdict_id: verdict, result, by_human: byHuman, at };
    const affinity = { ...character.skill_affinity };
    for (const tag of quest.tags) affinity[tag] = { window: kept(affinity[tag]?.window ?? [], entry) };
    return {
      ...character,
      reputation: { window: kept(character.reputation.window, entry) },
      skill_affinity: affinity,
    };
  };

/** After a verdict entered the window: a new level when the window has earned it. */
export function levelAfterVerdict(day: Day, id: CharacterId): void {
  const character = day.ledger.character(id);
  const level = levelChange(character);
  if (level === character.level) return;
  const type = level > character.level ? 'character.level_up' : 'character.level_down';
  day.ledger.change(id, type, (before, at) => CharacterSchema.parse({ ...before, level, level_since: at }));
}
