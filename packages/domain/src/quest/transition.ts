// transition(quest, event, actor): the only way a quest changes status (implementation-plan §2.5, ADR 0005).
// The Steward applies inbox commands, runner signals and mana readings through it; the sandbox generates fake
// days with it, so a fake day always obeys the same machine (ADR 0002). Read before changing: CLAUDE.md.
import { err, ok } from '../core/result.ts';
import { QuestSchema } from '../schema/quest/quest.ts';
import { applyEffect } from './effects.ts';
import { questTierIssues } from './invariants.ts';
import { QUEST_GUARDS, QUEST_TRANSITIONS } from './transitions.ts';
import type { Result } from '../core/result.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { QuestActor, QuestEvent, QuestEventType } from './events.ts';
import type { QuestTransitionError } from './transition-error.ts';
import type { QuestTransitionRow } from './transitions.ts';
import type { z } from 'zod';

/** The row `quest` takes on an event of this type, or why there is none (actors aside). */
export function findTransition(
  quest: Quest,
  type: QuestEventType,
): Result<QuestTransitionRow, QuestTransitionError> {
  const rows = QUEST_TRANSITIONS.filter((row) => row.from === quest.status && row.event === type);
  if (rows.length === 0) return err({ code: 'no_transition', from: quest.status, event: type });
  const row = rows.find(({ guard }) => guard === undefined || QUEST_GUARDS[guard](quest));
  if (row !== undefined) return ok(row);
  // Only guarded rows can fail to match, so every row left here names its guard.
  const guards = rows.map(({ guard }) => guard).filter((guard) => guard !== undefined);
  return err({ code: 'guard_failed', from: quest.status, event: type, guards });
}

/**
 * The runner speaks for the assignee and the verifier for itself, so each needs someone in that role. The Steward
 * judges only when no verifier holds the quest: a machine verdict never overrides a verifier's session (ADR 0008).
 */
function actorHolds(quest: Quest, event: QuestEvent, actor: QuestActor): boolean {
  if (actor === 'runner') return typeof quest.assignee === 'string';
  if (actor === 'verifier') return typeof quest.verifier === 'string';
  const verdict = event.type === 'verdict_pass' || event.type === 'verdict_fail';
  return actor !== 'steward' || !verdict || typeof quest.verifier !== 'string';
}

const issuesOf = (error: z.ZodError): string[] =>
  error.issues.map((issue) => `${issue.path.map(String).join('.')}: ${issue.message}`);

/**
 * The quest after `event`, caused by `actor`: one row of QUEST_TRANSITIONS, then the event's effect, then the
 * quest schema on the result. A refused event leaves the quest as it was; the caller keeps the old value.
 */
export function transition(
  quest: Quest,
  event: QuestEvent,
  actor: QuestActor,
): Result<Quest, QuestTransitionError> {
  const tierIssues = questTierIssues(quest);
  if (tierIssues.length > 0) return err({ code: 'invalid_quest', issues: tierIssues });
  const found = findTransition(quest, event.type);
  if (!found.ok) return found;
  const row = found.value;
  if (!row.actors.includes(actor)) return err({ code: 'actor_not_allowed', actor, allowed: row.actors });
  if (!actorHolds(quest, event, actor)) return err({ code: 'actor_not_holding', actor });
  const effect = applyEffect(quest, event, row.to);
  if (!effect.ok) return effect;
  const parsed = QuestSchema.safeParse({ ...effect.value, status: row.to, updated_at: event.at });
  if (!parsed.success) return err({ code: 'invalid_result', issues: issuesOf(parsed.error) });
  return ok(parsed.data);
}
