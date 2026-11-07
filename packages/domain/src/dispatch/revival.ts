// How a paused or blocked assignee comes back (implementation-plan §2.4, §3.5, ADR 0017): a fresh session built
// from handover.md and the journal, unless continuing the old CLI session is worth it and the adapter can.
import { MS_PER_MINUTE } from '../constants.ts';
import { parseInstant } from '../core/clock.ts';
import type { Instant } from '../core/clock.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Attempt } from '../schema/quest/quest-parts.ts';
import type { Quest } from '../schema/quest/quest.ts';

export type ResumePolicy = Pick<Kingdom['dispatch'], 'resume_after_mana' | 'resume_after_answer_minutes'>;

/** Why the assignee comes back: the owner answered its question (at `now`), or its pool's mana came back. */
export type Revival = { readonly kind: 'answer'; readonly now: Instant } | { readonly kind: 'mana' };

/** The session the quest's last assignee run ended with `outcome`: the one `--resume` would continue. */
function lastSession(quest: Quest, outcome: NonNullable<Attempt['outcome']>): string | null {
  const last = quest.attempt_log.findLast(({ role }) => role === 'assignee');
  return last?.outcome === outcome ? (last.session_id ?? null) : null;
}

/** Whether the answer comes within the policy's minutes of the question: past that the cache is cold. */
function answeredInTime(quest: Quest, now: Instant, minutes: number | null): boolean {
  if (minutes === null || quest.blocked === undefined) return false;
  const asked = parseInstant(quest.blocked.asked_at);
  return asked.ok && now - asked.value <= minutes * MS_PER_MINUTE;
}

/**
 * The CLI session a revived assignee continues with `--resume`, or null for a fresh session from the letter.
 * After mana only with `resume_after_mana` (off by default, principle 13); after an answer only within
 * `resume_after_answer_minutes` of the question; never when the tribe's adapter cannot resume (§3.14).
 */
export function resumedSession(
  quest: Quest,
  revival: Revival,
  policy: ResumePolicy,
  canResume: boolean,
): string | null {
  if (!canResume) return null;
  if (revival.kind === 'mana') return policy.resume_after_mana ? lastSession(quest, 'paused') : null;
  return answeredInTime(quest, revival.now, policy.resume_after_answer_minutes)
    ? lastSession(quest, 'blocked')
    : null;
}

/**
 * Whether `question` is the one the owner already answered: a letter that still carries it (the character did
 * not clear its Question section) does not block the quest again (P1-01, §2.4).
 */
export const answeredAlready = (quest: Pick<Quest, 'blocked'>, question: string): boolean =>
  quest.blocked?.answer !== undefined && quest.blocked.question.trim() === question.trim();
