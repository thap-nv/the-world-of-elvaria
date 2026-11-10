// What can happen to a quest (implementation-plan §2.5). The Steward turns inbox commands, runner signals and
// mana readings into these events and passes them to transition(); nothing else changes a quest's status
// (ADR 0005). Every event carries its time, so transition() stays a pure function of its arguments (ADR 0002).
import type { CharacterId } from '../core/ids.ts';

/**
 * Who causes an event (§2.5): the owner through the inbox (U), the Steward (S), the runner or hook acting for
 * the assignee (R), the verifier's session (V) and the mana monitor inside the Steward (M).
 */
export const QUEST_ACTORS = ['user', 'steward', 'runner', 'verifier', 'mana'] as const;
export type QuestActor = (typeof QUEST_ACTORS)[number];

/**
 * The breakers that stop a running session (§3.4); "too many attempts" is a crash or a fail at the limit. `commit`:
 * the territory's hooks refused the commit of a finished session's work, so the branch lacks it and the quest goes
 * to the infirmary instead of review (§3.3, P1-04); so does a patch for laws.patch_paths that the Steward could not
 * apply, since the branch would lack that change (P1-28). `secrets`: the treasury lacks a secret the quest asks for, or
 * the territory no longer allows it, so no session can open; the quest waits in the infirmary for the owner
 * instead of being claimed and released again every tick (§3.9, P1-06). `forbidden_paths`: a finished session left a
 * path of the territory's laws.forbidden_paths changed in its plot, which only a program its shell ran could do (the
 * fence stops the tools, not their children), so the Steward commits nothing and the owner looks first (P1-49).
 */
export const BREAKER_TRIPS = ['time', 'tokens', 'turns', 'commit', 'secrets', 'forbidden_paths'] as const;
export type BreakerTrip = (typeof BREAKER_TRIPS)[number];

/**
 * Why a quest is in the infirmary (`quest.infirmary` data `trip`, P1-32): the breaker that tripped, the attempts
 * running out (a crash or a fail at max_attempts), or a script-tier run the machine could not finish: its script
 * broke, could not use the quest's params (`usage`), or did not pass. A script past its time trips `time`.
 * `no_verdict`: the review stalled because its last judge left without a verdict, its CLI failed or its output
 * was none (P1-33); a review whose last judge a breaker stopped names that breaker instead. `partial_verdicts`: the
 * review stalled because REVIEW_PARTIALS_MAX judges of the run handed in a partial verdict (P1-42).
 */
export const INFIRMARY_TRIPS = [
  ...BREAKER_TRIPS,
  'no_verdict',
  'partial_verdicts',
  'max_attempts',
  'script_broken',
  'script_usage',
  'script_fail',
] as const;
export type InfirmaryTrip = (typeof INFIRMARY_TRIPS)[number];

/** Events with nothing to say but their time. */
const PLAIN = [
  'confirm',
  'discard',
  'release',
  'unblock',
  'return',
  'reject',
  'deliver',
  'archive',
  'retry',
] as const;
/**
 * Events that end the session holding the quest; the runner may know its id and token count by then.
 * `verdict_partial`: a judge hands in a partial verdict and leaves, the next one reads on (P1-33: told apart from a
 * crash, which counts toward a stalled review and a partial does not).
 */
const RUN_ENDS = [
  'submit',
  'mana_out',
  'crash',
  'cancel',
  'suspend',
  'verdict_pass',
  'verdict_fail',
  'verdict_partial',
] as const;
/** Events that open a new session of the assignee; the runner may already know its id. */
const SESSION_STARTS = ['start', 'redispatch', 'mana_restored'] as const;

export const QUEST_EVENT_TYPES = [
  ...PLAIN,
  ...RUN_ENDS,
  ...SESSION_STARTS,
  'claim',
  'reassign',
  'block',
  'ask',
  'breaker',
  'answer',
  'assign_verifier',
  'seal',
] as const;
export type QuestEventType = (typeof QUEST_EVENT_TYPES)[number];

interface Timed {
  /** ISO 8601 with an offset, as every timestamp in quest.json (implementation-plan §2.1). */
  readonly at: string;
}

/**
 * A session that followed the first in the same run (runner-core's spawnSequel, P1-33): a reply tried once more, a
 * reminder of the letter. Either part may be unknown.
 */
export interface SequelRun {
  readonly session_id?: string;
  readonly why?: string;
}

/**
 * What the runner knows when a session ends: attempt_log[].session_id and tokens (the tokens of every session of
 * the run). `sequels` goes on the line that tells the end, never into attempt_log, so the log counts every session
 * a run opened (P1-49, (c) of P1-33).
 */
export interface RunEnd {
  readonly session_id?: string;
  readonly tokens?: number;
  readonly sequels?: readonly SequelRun[];
}

interface SessionStart {
  readonly session_id?: string;
}

/** The character that takes the quest, and its level at that moment (character.level). */
interface TakenBy {
  readonly assignee: CharacterId;
  readonly level: number;
}

// Distributive over T: one union member per event type, so `Extract<QuestEvent, { type: 'x' }>` works.
type Shaped<T extends string, Extra> = T extends string ? Timed & Extra & { readonly type: T } : never;

export type QuestEvent =
  | Shaped<(typeof PLAIN)[number], unknown>
  | Shaped<(typeof RUN_ENDS)[number], RunEnd>
  | Shaped<(typeof SESSION_STARTS)[number], SessionStart>
  /**
   * A session-tier quest is claimed by a character, whose level comes along: taking a rank above its ceiling
   * makes the quest wait for the royal seal. A script-tier quest is claimed by nobody (the Steward runs it).
   */
  | Shaped<'claim', TakenBy | { readonly assignee: null }>
  | Shaped<'reassign', TakenBy>
  | Shaped<'block', { readonly question: string }>
  | Shaped<'ask', RunEnd & { readonly question: string }>
  | Shaped<'breaker', RunEnd & { readonly trip: BreakerTrip }>
  | Shaped<'answer', SessionStart & { readonly answer: string }>
  | Shaped<'assign_verifier', SessionStart & { readonly verifier: CharacterId }>
  | Shaped<'seal', { readonly note?: string }>;

export type QuestEventOf<T extends QuestEventType> = Extract<QuestEvent, { readonly type: T }>;
