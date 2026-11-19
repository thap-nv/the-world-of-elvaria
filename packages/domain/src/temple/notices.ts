// The digest's notices of the Temple (PS-12g), from the files and the log alone, so the Steward's digest and
// `elvaria digest` list the same: the characters suspended for a fail streak (streakSuspendedOf, streakWaitsOf), and the
// repeated failures that wait while the Temple cannot run (templeWaitingOf), counted as the Temple's evidence counts them:
// the last judged runs whenever they were, no window of days (item (q) of the PS-12b row).
import { lessonEvidenceOf } from '../metrics/lesson-runs.ts';
import { repeatedFailuresOf } from '../metrics/repeated-failures.ts';
import { streakSuspendedOf } from './due.ts';
import { streakWaitsOf, templeWaitingOf } from './waiting.ts';
import type { Character } from '../schema/character/character.ts';
import type { Event } from '../schema/event/event.ts';
import type { Memo } from '../schema/memo/memo.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Verdict } from '../schema/quest/verdict.ts';
import type { StreakWait, TempleWaiting, TempleWaitingSource } from './waiting.ts';

export interface TempleNoticeSource {
  /** kingdom.schedule.temple.enabled. */
  readonly enabled: boolean;
  /** The registry's classes. */
  readonly classes: TempleWaitingSource['classes'];
  readonly characters: readonly Character[];
  readonly quests: readonly Quest[];
  readonly verdicts: readonly Verdict[];
  readonly memos: readonly Memo[];
  /** The kingdom's whole log, in its order. */
  readonly events: readonly Event[];
}

export interface TempleNotices {
  readonly streak_suspended: readonly StreakWait[];
  readonly temple_waiting?: TempleWaiting;
}

export function templeNoticesOf(source: TempleNoticeSource): TempleNotices {
  const { enabled, classes, characters, quests, verdicts, memos, events } = source;
  const evidence = lessonEvidenceOf({ quests, verdicts, events, commands: [], characters });
  const waiting = templeWaitingOf({
    enabled,
    characters,
    classes,
    groups: repeatedFailuresOf(evidence).length,
  });
  const streak = streakSuspendedOf(events);
  return {
    streak_suspended: streakWaitsOf({ characters, classes, streak, memos, quests }),
    ...(waiting === undefined ? {} : { temple_waiting: waiting }),
  };
}
