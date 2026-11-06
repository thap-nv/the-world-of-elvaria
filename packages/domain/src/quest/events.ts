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

/** The breakers that stop a running session (§3.4); "too many attempts" is a crash or a fail at the limit. */
export const BREAKER_TRIPS = ['time', 'tokens', 'turns'] as const;
export type BreakerTrip = (typeof BREAKER_TRIPS)[number];

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
/** Events that end the session holding the quest; the runner may know its id and token count by then. */
const RUN_ENDS = [
  'submit',
  'mana_out',
  'crash',
  'cancel',
  'suspend',
  'verdict_pass',
  'verdict_fail',
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

/** What the runner knows when a session ends: attempt_log[].session_id and tokens. */
export interface RunEnd {
  readonly session_id?: string;
  readonly tokens?: number;
}

interface SessionStart {
  readonly session_id?: string;
}

// Distributive over T: one union member per event type, so `Extract<QuestEvent, { type: 'x' }>` works.
type Shaped<T extends string, Extra> = T extends string ? Timed & Extra & { readonly type: T } : never;

export type QuestEvent =
  | Shaped<(typeof PLAIN)[number], unknown>
  | Shaped<(typeof RUN_ENDS)[number], RunEnd>
  | Shaped<(typeof SESSION_STARTS)[number], SessionStart>
  /** `assignee` is a character for a session-tier quest and null for a script-tier one (the Steward runs it). */
  | Shaped<'claim', { readonly assignee: CharacterId | null }>
  | Shaped<'reassign', { readonly assignee: CharacterId }>
  | Shaped<'block', { readonly question: string }>
  | Shaped<'ask', RunEnd & { readonly question: string }>
  | Shaped<'breaker', RunEnd & { readonly trip: BreakerTrip }>
  | Shaped<'answer', SessionStart & { readonly answer: string }>
  | Shaped<'assign_verifier', SessionStart & { readonly verifier: CharacterId }>
  | Shaped<'seal', { readonly note?: string }>;

export type QuestEventOf<T extends QuestEventType> = Extract<QuestEvent, { readonly type: T }>;
