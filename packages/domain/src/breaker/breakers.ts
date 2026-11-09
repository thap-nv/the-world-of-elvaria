// Step 3 of a tick (implementation-plan §3.1, §3.4): which of the sessions the Steward holds ran past a breaker.
// The clock of a session is its own attempt_log entry: a session revived after mana or an answer is a fresh
// context (principle 13) with a fresh clock, and its tokens are the ones its own stream reported.
import { parseInstant } from '../core/clock.ts';
import { evaluateBreakers } from './evaluate.ts';
import type { SessionTrip, UsageSoFar } from './evaluate.ts';
import type { Instant } from '../core/clock.ts';
import type { QuestId } from '../core/ids.ts';
import type { Role } from '../schema/common.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Quest } from '../schema/quest/quest.ts';

/** A session the Steward holds on a quest, with what its stream reported so far. */
export interface HeldSession {
  readonly quest: QuestId;
  readonly role: Role;
  readonly usage: UsageSoFar;
}

/** A session to stop now, and why: the infirmary reason (assignee) or the log line (verifier) says it. */
export interface Breaker {
  readonly quest: QuestId;
  readonly role: Role;
  readonly trip: SessionTrip;
  readonly detail: string;
}

/** The session's own entry: the latest one of its role that has not ended. */
const openEntryOf = (quest: Quest, role: Role) =>
  quest.attempt_log.findLast((entry) => entry.role === role && entry.ended_at === undefined);

/** The kingdom's breaker settings a session is held to beside its quest's budget. */
export type SessionRules = Pick<Kingdom['breakers'], 'max_turns' | 'verifier_tokens_multiplier'>;

/**
 * The token ceiling of a session: the quest's budget for its assignee, that budget times
 * `verifier_tokens_multiplier` for a judge (P1-18 proposal (f)), who reads the whole diff and runs the checks again.
 */
export const tokenCeilingOf = (quest: Quest, role: Role, rules: SessionRules): number =>
  role === 'verifier'
    ? Math.round(quest.budget.max_tokens * rules.verifier_tokens_multiplier)
    : quest.budget.max_tokens;

/**
 * The held sessions that tripped a breaker, in the order given. A session whose quest or entry is gone (the file
 * moved on in this tick) is not the plan's to stop: the end the runner reports settles it.
 */
export function breakersOf(
  quests: readonly Quest[],
  sessions: readonly HeldSession[],
  rules: SessionRules,
  now: Instant,
): Breaker[] {
  const byId = new Map(quests.map((quest) => [quest.id, quest]));
  return sessions.flatMap((session) => {
    const quest = byId.get(session.quest);
    const entry = quest === undefined ? undefined : openEntryOf(quest, session.role);
    const started = entry === undefined ? undefined : parseInstant(entry.started_at);
    if (quest === undefined || started?.ok !== true) return [];
    const limits = {
      max_minutes: quest.budget.max_minutes,
      max_tokens: tokenCeilingOf(quest, session.role, rules),
      max_turns: rules.max_turns,
    };
    const verdict = evaluateBreakers({ started_at: started.value }, limits, now, session.usage);
    return verdict === 'ok' ? [] : [{ quest: quest.id, role: session.role, ...verdict }];
  });
}
