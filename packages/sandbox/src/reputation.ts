// What a verdict does to the assignee's file (implementation-plan §2.6, §3.13), the way the Steward does it: the
// domain's withVerdict puts one entry in the reputation window and in the window of each of the quest's tags and
// keeps the fail streak (P1-04); then the level moves when levelChange says so, with a character.level_up or
// level_down line of its own.
import { CharacterSchema, levelChange, withVerdict } from '@elvaria/domain';
import type { CharacterId, FailKind, Quest, VerdictId } from '@elvaria/domain';

import type { Day } from './day.ts';
import type { Edit } from './ledger.ts';

/** A pass, or a fail and its kind. */
export type Outcome = { readonly result: 'pass' } | { readonly result: 'fail'; readonly fail_kind: FailKind };

export const judged =
  (quest: Quest, verdict: VerdictId, outcome: Outcome, byHuman = false): Edit =>
  (character, at) =>
    withVerdict(character, { ...outcome, verdict_id: verdict, by_human: byHuman, at, tags: quest.tags });

/** After a verdict entered the window: a new level when the window has earned it. */
export function levelAfterVerdict(day: Day, id: CharacterId): void {
  const character = day.ledger.character(id);
  const level = levelChange(character);
  if (level === character.level) return;
  const type = level > character.level ? 'character.level_up' : 'character.level_down';
  day.ledger.change(id, type, (before, at) => CharacterSchema.parse({ ...before, level, level_since: at }));
}
