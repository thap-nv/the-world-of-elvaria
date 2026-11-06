// Why transition() refused an event. Stable codes, so the Steward can log them and the CLI can translate them
// through i18n when it rejects an inbox command (command.rejected).
import type { QuestStatus } from '../schema/quest/shared.ts';
import type { QuestActor, QuestEventType } from './events.ts';
import type { QuestGuard } from './transitions.ts';

/** The event names something the quest cannot take, whatever its status. */
export type InvalidEventReason =
  /** A session-tier quest is claimed by a character, a script-tier quest by nobody (the Steward runs it). */
  | 'assignee_for_tier'
  /** The doer never judges (ADR 0008): not the assignee, not anyone who worked an attempt of this quest. */
  | 'verifier_worked';

export type QuestTransitionError =
  /** The quest breaks an invariant that only the state machine keeps; `issues` are English, for logs. */
  | { readonly code: 'invalid_quest'; readonly issues: readonly string[] }
  /** No row of QUEST_TRANSITIONS leaves `from` on `event`. */
  | { readonly code: 'no_transition'; readonly from: QuestStatus; readonly event: QuestEventType }
  /** Rows exist, but the quest meets none of their guards. */
  | {
      readonly code: 'guard_failed';
      readonly from: QuestStatus;
      readonly event: QuestEventType;
      readonly guards: readonly QuestGuard[];
    }
  | {
      readonly code: 'actor_not_allowed';
      readonly actor: QuestActor;
      readonly allowed: readonly QuestActor[];
    }
  /** The runner or verifier acts for a role nobody holds, or the Steward judges over a verifier's session. */
  | { readonly code: 'actor_not_holding'; readonly actor: QuestActor }
  | { readonly code: 'invalid_event'; readonly reason: InvalidEventReason }
  /** The new quest fails its schema, e.g. an `at` that is not ISO 8601; `issues` are English, for logs. */
  | { readonly code: 'invalid_result'; readonly issues: readonly string[] };
