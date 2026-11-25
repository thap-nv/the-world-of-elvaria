// Step 3 of a tick (implementation-plan §3.1, §3.4): which of the sessions the Steward holds ran past a breaker.
// The clock of a session is its own attempt_log entry: a session revived after mana or an answer is a fresh
// context (principle 13) with a fresh clock, and its tokens are the ones its own stream reported.
import { parseInstant } from '../core/clock.ts';
import { BREAKER_DEFAULTS, HEAL_DEFAULTS } from '../constants.ts';
import { CONTEXT_BUDGETS_BY_RANK } from '../dispatch/constants.ts';
import { evaluateBreakers } from './evaluate.ts';
import { staminaOf } from './stamina.ts';
import type { BreakerVerdict, SessionTrip, UsageSoFar, WrapUp } from './evaluate.ts';
import type { Stamina } from './stamina.ts';
import type { Instant } from '../core/clock.ts';
import type { QuestId } from '../core/ids.ts';
import type { Role } from '../schema/common.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Character } from '../schema/character/character.ts';
import type { RosterSource } from '../dispatch/roster.ts';
import type { TribeLimits } from '../tribe/tribe-limits.ts';
import type { Calibration, TribeCalibration } from './calibration.ts';

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
    readonly context_budget_tokens?: number;
    readonly mana_multiplier?: number;
    readonly characters?: ReadonlyMap<string, Pick<Character, 'tribe'>>;
    readonly tribes?: readonly Pick<Kingdom['tribes'][number], 'id' | 'max_turns'>[];
    /** A heal session's ceilings (ADR 0034); HEAL_DEFAULTS when absent. */
    readonly heal?: Pick<Kingdom['heal'], 'tokens' | 'minutes'> | undefined;
  };

/**
 * Who holds the session of `role`: the quest's assignee or verifier, but a heal session's own character, since a
 * healer's is a doer of the quest that is not its assignee (ADR 0034).
 */
function holderOf(quest: Quest, role: Role): string | null | undefined {
  if (role === 'verifier') return quest.verifier;
  const entry = openEntryOf(quest, role);
  return entry?.heal === 'session' ? entry.character : quest.assignee;
}

/** The tribe of the character holding `role` on the quest; none for an empty seat or a character not in `rules`. */
export const holderTribeOf = (quest: Quest, role: Role, rules: SessionRules): string | undefined => {
  const holder = holderOf(quest, role);
  return typeof holder === 'string' ? rules.characters?.get(holder)?.tribe : undefined;
};

/** The holder's tribe may override the kingdom's nominal turn ceiling, for either role. */
export const turnCeilingOf = (
  quest: Quest,
  role: Role,
  rules: SessionRules,
  calibration?: TribeCalibration,
): number => {
  if (calibration !== undefined) return calibration.max_turns.value;
  const tribe = holderTribeOf(quest, role, rules);
  return rules.tribes?.find(({ id }) => id === tribe)?.max_turns ?? rules.max_turns;
};

export type SessionWrapUp = WrapUp & Pick<HeldSession, 'quest' | 'role'>;

/** A calibrated token ceiling in parts, so a reader can say which one set it (PS-28b). */
export interface TokenParts {
  /** The rank's share of context_budget_tokens times mana_multiplier: the floor. */
  readonly rank_share: number;
  /** estimate.tokens times the tribe's estimate factor. */
  readonly estimated: number;
  /** The budget at creation, max(estimate, rank's share) times mana_multiplier: a budget counts as a raise above it. */
  readonly baseline: number;
  /** The budget when it is above the baseline, else 0. */
  readonly raised: number;
  /** The assignee's ceiling: the largest of the three, rounded. */
  readonly tokens: number;
}

export function tokenPartsOf(quest: Quest, rules: SessionRules, calibration: TribeCalibration): TokenParts {
  const multiplier = rules.mana_multiplier ?? BREAKER_DEFAULTS.mana_multiplier;
  const context = rules.context_budget_tokens ?? BREAKER_DEFAULTS.context_budget_tokens;
  const rankTokens = Math.round(context * CONTEXT_BUDGETS_BY_RANK[quest.rank]);
  const baseline = Math.round(Math.max(quest.estimate.tokens, rankTokens) * multiplier);
  // An explicit raise above the creation budget remains a floor, not another estimate multiplier.
  const raised = quest.budget.max_tokens > baseline ? quest.budget.max_tokens : 0;
  const rank_share = rankTokens * multiplier;
  const estimated = quest.estimate.tokens * calibration.estimate_factor.value;
  return {
    rank_share,
    estimated,
    baseline,
    raised,
    tokens: Math.round(Math.max(rank_share, estimated, raised)),
  };
}

/**
 * The token ceiling of a session: the quest's budget for its assignee, that budget times
 * `verifier_tokens_multiplier` for a judge (P1-18 proposal (f)), who reads the whole diff and runs the checks again.
 */
export const tokenCeilingOf = (
  quest: Quest,
  role: Role,
  rules: SessionRules,
  calibration?: TribeCalibration,
): number => {
  const tokens =
    calibration === undefined ? quest.budget.max_tokens : tokenPartsOf(quest, rules, calibration).tokens;
  return role === 'verifier' ? Math.round(tokens * rules.verifier_tokens_multiplier) : tokens;
};

/**
 * A session's time and token ceilings: the quest's, or for a heal session kingdom.heal's (ADR 0034), small and the
 * same for every quest, so a heal that runs long stops at once instead of redoing the work. Turns keep the tribe's.
 */
function ceilingsOf(
  quest: Quest,
  role: Role,
  heals: boolean,
  rules: SessionRules,
  calibration: TribeCalibration | undefined,
): { readonly max_minutes: number; readonly max_tokens: number } {
  if (heals) {
    const heal = rules.heal ?? HEAL_DEFAULTS;
    return { max_minutes: heal.minutes, max_tokens: heal.tokens };
  }
  return {
    max_minutes: quest.budget.max_minutes,
    max_tokens: tokenCeilingOf(quest, role, rules, calibration),
  };
}

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
    const holder = holderOf(quest, role);
    const tribe = typeof holder === 'string' ? characters.get(holder)?.tribe : undefined;
    return (tribe === undefined ? undefined : limits[tribe]?.breakers) ?? 'tokens_and_minutes';
  };

/** A held session read once: what the breakers say of it, and its stamina bar (PS-28) from the same gauges. */
export interface SessionReading {
  readonly quest: QuestId;
  readonly role: Role;
  readonly verdict: BreakerVerdict;
  readonly stamina: Stamina;
}

/**
 * Every held session read against its ceilings, in the order given. A session whose quest or entry is gone (the file
 * moved on in this tick) is not the plan's to stop: the end the runner reports settles it, and it has no bar.
 */
export function sessionReadingsOf(
  quests: readonly Quest[],
  sessions: readonly HeldSession[],
  rules: SessionRules,
  now: Instant,
  measure: BreakerMeasure = () => 'tokens_and_minutes',
  calibration?: Calibration,
): SessionReading[] {
  const byId = new Map(quests.map((quest) => [quest.id, quest]));
  return sessions.flatMap((session) => {
    const quest = byId.get(session.quest);
    const entry = quest === undefined ? undefined : openEntryOf(quest, session.role);
    const started = entry === undefined ? undefined : parseInstant(entry.started_at);
    if (quest === undefined || started?.ok !== true) return [];
    const tribe = holderTribeOf(quest, session.role, rules);
    const calibrated = tribe === undefined ? undefined : calibration?.get(tribe);
    const limits = {
      ...ceilingsOf(quest, session.role, entry?.heal === 'session', rules, calibrated),
      max_turns: turnCeilingOf(quest, session.role, rules, calibrated),
      ...(rules.soft_pct === undefined ? {} : { soft_pct: rules.soft_pct }),
      ...(rules.hard_pct === undefined ? {} : { hard_pct: rules.hard_pct }),
    };
    const read = [
      { started_at: started.value },
      limits,
      now,
      session.usage,
      measure(quest, session.role),
    ] as const;
    return [
      {
        quest: quest.id,
        role: session.role,
        verdict: evaluateBreakers(...read),
        stamina: staminaOf(...read, session.role),
      },
    ];
  });
}

/** Hard stops only: existing callers never receive a soft warning as a breaker. */
export function breakersOf(...args: Parameters<typeof sessionReadingsOf>): Breaker[] {
  return sessionReadingsOf(...args).flatMap(({ quest, role, verdict }) =>
    verdict !== 'ok' && 'trip' in verdict ? [{ quest, role, ...verdict }] : [],
  );
}

/** The sessions of `readings` needing a reminder, in their order; a hard stop is never also a reminder. */
export const wrapUpsIn = (readings: readonly SessionReading[]): SessionWrapUp[] =>
  readings.flatMap(({ quest, role, verdict }) =>
    verdict !== 'ok' && 'kind' in verdict ? [{ quest, role, ...verdict }] : [],
  );

/** Sessions needing a reminder, in held order. */
export function wrapUpsOf(...args: Parameters<typeof sessionReadingsOf>): SessionWrapUp[] {
  return wrapUpsIn(sessionReadingsOf(...args));
}
