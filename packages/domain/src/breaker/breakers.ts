// Step 3 of a tick (implementation-plan §3.1, §3.4): which of the sessions the Steward holds ran past a breaker.
// The clock of a session is its own attempt_log entry: a session revived after mana or an answer is a fresh
// context (principle 13) with a fresh clock, and its tokens are the ones its own stream reported.
import { parseInstant } from '../core/clock.ts';
import { evaluateBreakers } from './evaluate.ts';
import type { SessionTrip, UsageSoFar, WrapUp } from './evaluate.ts';
import type { Instant } from '../core/clock.ts';
import type { QuestId } from '../core/ids.ts';
import type { Role } from '../schema/common.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Character } from '../schema/character/character.ts';
import type { RosterSource } from '../dispatch/roster.ts';
import type { TribeLimits } from '../tribe/tribe-limits.ts';

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
  readonly params: Readonly<Record<string, number>>;
}

/** The session's own entry: the latest one of its role that has not ended. */
const openEntryOf = (quest: Quest, role: Role) =>
  quest.attempt_log.findLast((entry) => entry.role === role && entry.ended_at === undefined);

/** The kingdom's breaker settings a session is held to beside its quest's budget. */
export type SessionRules = Pick<Kingdom['breakers'], 'max_turns' | 'verifier_tokens_multiplier'> &
  Partial<Pick<Kingdom['breakers'], 'soft_pct' | 'hard_pct'>> & {
    readonly characters?: ReadonlyMap<string, Pick<Character, 'tribe'>>;
    readonly tribes?: readonly Pick<Kingdom['tribes'][number], 'id' | 'max_turns'>[];
  };

/** The holder's tribe may override the kingdom's nominal turn ceiling, for either role. */
export const turnCeilingOf = (quest: Quest, role: Role, rules: SessionRules): number => {
  const holder = role === 'assignee' ? quest.assignee : quest.verifier;
  const tribe = typeof holder === 'string' ? rules.characters?.get(holder)?.tribe : undefined;
  return rules.tribes?.find(({ id }) => id === tribe)?.max_turns ?? rules.max_turns;
};

export type SessionWrapUp = WrapUp & Pick<HeldSession, 'quest' | 'role'>;

/**
 * The token ceiling of a session: the quest's budget for its assignee, that budget times
 * `verifier_tokens_multiplier` for a judge (P1-18 proposal (f)), who reads the whole diff and runs the checks again.
 */
export const tokenCeilingOf = (quest: Quest, role: Role, rules: SessionRules): number =>
  role === 'verifier'
    ? Math.round(quest.budget.max_tokens * rules.verifier_tokens_multiplier)
    : quest.budget.max_tokens;

/** What the breakers of a session on `quest` in `role` measure: its holder's tribe's (tribeLimitsOf, §3.14). */
export type BreakerMeasure = (quest: Quest, role: Role) => TribeLimits['breakers'];

/**
 * The measure of each session from the tribe of the character holding it (P1-33): a tribe without `usage` has
 * minutes only. A holder or a tribe the snapshot does not know keeps every breaker.
 */
export const measureOf =
  (
    characters: ReadonlyMap<string, Pick<Character, 'tribe'>>,
    limits: RosterSource['limits'],
  ): BreakerMeasure =>
  (quest, role) => {
    const holder = role === 'assignee' ? quest.assignee : quest.verifier;
    const tribe = typeof holder === 'string' ? characters.get(holder)?.tribe : undefined;
    return (tribe === undefined ? undefined : limits[tribe]?.breakers) ?? 'tokens_and_minutes';
  };

/**
 * The held sessions that tripped a breaker, in the order given. A session whose quest or entry is gone (the file
 * moved on in this tick) is not the plan's to stop: the end the runner reports settles it.
 */
function evaluationsOf(
  quests: readonly Quest[],
  sessions: readonly HeldSession[],
  rules: SessionRules,
  now: Instant,
  measure: BreakerMeasure = () => 'tokens_and_minutes',
) {
  const byId = new Map(quests.map((quest) => [quest.id, quest]));
  return sessions.flatMap((session) => {
    const quest = byId.get(session.quest);
    const entry = quest === undefined ? undefined : openEntryOf(quest, session.role);
    const started = entry === undefined ? undefined : parseInstant(entry.started_at);
    if (quest === undefined || started?.ok !== true) return [];
    const limits = {
      max_minutes: quest.budget.max_minutes,
      max_tokens: tokenCeilingOf(quest, session.role, rules),
      max_turns: turnCeilingOf(quest, session.role, rules),
      ...(rules.soft_pct === undefined ? {} : { soft_pct: rules.soft_pct }),
      ...(rules.hard_pct === undefined ? {} : { hard_pct: rules.hard_pct }),
    };
    const verdict = evaluateBreakers(
      { started_at: started.value },
      limits,
      now,
      session.usage,
      measure(quest, session.role),
    );
    return verdict === 'ok' ? [] : [{ quest: quest.id, role: session.role, verdict }];
  });
}

/** Hard stops only: existing callers never receive a soft warning as a breaker. */
export function breakersOf(...args: Parameters<typeof evaluationsOf>): Breaker[] {
  return evaluationsOf(...args).flatMap(({ quest, role, verdict }) =>
    'trip' in verdict ? [{ quest, role, ...verdict }] : [],
  );
}

/** Sessions needing a reminder, in held order; a hard stop is never also a reminder. */
export function wrapUpsOf(...args: Parameters<typeof evaluationsOf>): SessionWrapUp[] {
  return evaluationsOf(...args).flatMap(({ quest, role, verdict }) =>
    'kind' in verdict ? [{ quest, role, ...verdict }] : [],
  );
}
