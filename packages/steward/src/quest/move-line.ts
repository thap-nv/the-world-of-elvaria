// The line of a quest move (ADR 0005, implementation-plan §2.3, P0-09): its type, and what it carries beside the view
// of the quest after the move. Apart from record.ts, the pen that writes the files: nothing here writes.
import { characterViewOf, endedInHealDue, questLogTypeOf, questViewOf } from '@elvaria/domain';
import type { Character, CharacterId, LoadTrace, Quest, QuestEvent, QuestLogType } from '@elvaria/domain';
import type { RefusedWork } from '@elvaria/runner-core';

import { OUT_OF_ATTEMPTS, infirmaryData } from './infirmary.ts';
import type { InfirmaryCause } from './infirmary.ts';

/** What a healer changed of the doer's refused work, on the submit of its session (ADR 0034, HL-04's contract). */
export interface SubmittedHeal {
  readonly by: CharacterId;
  readonly files: number;
  readonly lines: number;
  /** `.runs/<quest>-<n>/heal/heal.patch`, relative to the kingdom. */
  readonly patch: string;
}

/** What a move says on its line only: the quest file and attempt_log stay as the event leaves them. */
export interface MoveLineFields {
  /** Why, should the move land in the infirmary (§3.4, P1-32); OUT_OF_ATTEMPTS when it does not say. */
  readonly infirmary?: InfirmaryCause;
  /** What the prompt of the session this move opens carried (PS-01b, §3.16.1), as `sequels` is. */
  readonly load_trace?: LoadTrace;
  /** On a submit, the files the work changed outside the quest's scope (PS-05). */
  readonly out_of_scope?: readonly string[];
  /** On a submit of a quest the delegation spared the seal, its branch's size (PS-08b). */
  readonly diff_lines?: number;
  /**
   * On the blocked line of a run that ended on its amendment, what the Steward could not take of its work and why
   * (fix/session-notes); the doer's next session reads it (continuation.ts).
   */
  readonly refused?: RefusedWork;
  /** (HL-05) On the submit of a healer's session, what it changed (ADR 0034). */
  readonly heal?: SubmittedHeal;
}

/**
 * The line of a move. A breaker that sent the doer's refused commit back for a heal (its entry now `due`, ADR 0034)
 * is `quest.heal_due`, which questLogTypeOf cannot tell from a cut that goes on: same event, same statuses.
 */
export const lineTypeOf = (event: QuestEvent, from: Quest, after: Quest): QuestLogType =>
  event.type === 'breaker' && after.status === 'returned' && endedInHealDue(after.attempt_log)
    ? 'quest.heal_due'
    : questLogTypeOf(event.type, from.status, after.status);

/** Why the quest went where it did: the infirmary's cause, or the refusal a heal answers (as the infirmary says it). */
function causeOf(type: QuestLogType, fields: MoveLineFields) {
  const cause = fields.infirmary ?? OUT_OF_ATTEMPTS;
  if (type === 'quest.infirmary') return infirmaryData(cause);
  return type === 'quest.heal_due' ? { reason: cause.reason } : {};
}

/** The data of a move's line: the cause, the views after the move, and what the move says on its line only. */
export function moveDataOf(
  type: QuestLogType,
  event: QuestEvent,
  after: Quest,
  characters: readonly Character[],
  fields: MoveLineFields,
) {
  // The sessions that followed the first in the run that ends here (P1-49): attempt_log keeps one entry for them all.
  const sequels = 'sequels' in event ? event.sequels : undefined;
  return {
    ...causeOf(type, fields),
    // The healer whose session opens: quest.healing names it (ADR 0034).
    ...(event.type === 'heal' ? { healer: event.healer } : {}),
    quest: questViewOf(after),
    ...(characters.length > 0 ? { characters: characters.map(characterViewOf) } : {}),
    ...(sequels === undefined || sequels.length === 0 ? {} : { sequels }),
    ...(fields.load_trace === undefined ? {} : { load_trace: fields.load_trace }),
    ...(fields.out_of_scope === undefined || fields.out_of_scope.length === 0
      ? {}
      : { out_of_scope: fields.out_of_scope }),
    ...(fields.diff_lines === undefined ? {} : { diff_lines: fields.diff_lines }),
    ...(fields.heal === undefined ? {} : { heal: fields.heal }),
    ...fields.refused,
  };
}
