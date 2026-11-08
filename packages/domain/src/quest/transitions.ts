// The quest state machine as data (implementation-plan §2.5): every status change of a quest is one row of this
// table, and transition() refuses anything else. The table in the plan is rendered from these rows
// (renderQuestTransitionTable), so the document cannot drift from the code. Read before changing: CLAUDE.md.
import { reviewStalled } from '../breaker/review.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { QuestStatus } from '../schema/quest/shared.ts';
import type { QuestActor, QuestEventType } from './events.ts';

/** A condition on the quest that picks one row when an event leads to different statuses. */
export type QuestGuard =
  | 'session'
  | 'script'
  | 'can_retry'
  | 'out_of_retries'
  | 'seal_required'
  | 'no_seal'
  | 'has_assignee'
  | 'no_assignee'
  | 'needs_verifier'
  | 'has_verifier'
  | 'undelivered'
  | 'stalled_review'
  | 'no_stalled_review';

/** A script-tier quest has no character to retry it: a crash or a fail goes to the infirmary (§2.5). */
const canRetry = (quest: Quest): boolean =>
  quest.tier === 'session' && quest.attempts < quest.budget.max_attempts;

export const QUEST_GUARDS: Readonly<Record<QuestGuard, (quest: Quest) => boolean>> = {
  session: (quest) => quest.tier === 'session',
  script: (quest) => quest.tier === 'script',
  can_retry: canRetry,
  out_of_retries: (quest) => !canRetry(quest),
  seal_required: (quest) => quest.seal_required,
  no_seal: (quest) => !quest.seal_required,
  has_assignee: (quest) => typeof quest.assignee === 'string',
  no_assignee: (quest) => typeof quest.assignee !== 'string',
  // A script-tier quest is judged by the machine and never gets a character as verifier (closes a gap of v1).
  needs_verifier: (quest) => quest.tier === 'session' && typeof quest.verifier !== 'string',
  has_verifier: (quest) => typeof quest.verifier === 'string',
  // Delivery stamps deliverable.delivered_at instead of being a status of its own, so it happens once.
  undelivered: (quest) => quest.deliverable.delivered_at === undefined,
  // The breakers cut REVIEW_BREAKS_MAX verifiers of the run (P1-23): the work is done, only its review stalled.
  stalled_review: reviewStalled,
  no_stalled_review: (quest) => !reviewStalled(quest),
};

export interface QuestTransitionRow {
  readonly from: QuestStatus;
  readonly event: QuestEventType;
  readonly actors: readonly QuestActor[];
  /** Rows sharing `from` and `event` have guards that never hold together (tested). */
  readonly guard?: QuestGuard;
  readonly to: QuestStatus;
}

const U = ['user'] as const;
const S = ['steward'] as const;
const R = ['runner'] as const;
const M = ['mana'] as const;
/** A verdict comes from the verifier's session, or from the Steward when the machine judges (ADR 0008). */
const VS = ['verifier', 'steward'] as const;
const US = ['user', 'steward'] as const;

export const QUEST_TRANSITIONS: readonly QuestTransitionRow[] = [
  { from: 'draft', event: 'confirm', actors: U, to: 'open' },
  { from: 'draft', event: 'discard', actors: U, to: 'archived' },
  { from: 'open', event: 'claim', actors: S, to: 'claimed' },
  { from: 'open', event: 'block', actors: S, to: 'blocked' },
  // The owner names the character; the level bounds only the Steward's own choice (canTake).
  { from: 'open', event: 'reassign', actors: U, guard: 'session', to: 'claimed' },
  { from: 'open', event: 'cancel', actors: U, to: 'archived' },
  { from: 'claimed', event: 'start', actors: S, to: 'working' },
  { from: 'claimed', event: 'release', actors: S, to: 'open' },
  { from: 'claimed', event: 'cancel', actors: U, to: 'archived' },
  // No session can open (trip `secrets`): only the owner can fix the treasury or the territory (P1-06).
  { from: 'claimed', event: 'breaker', actors: S, to: 'infirmary' },
  { from: 'working', event: 'submit', actors: R, guard: 'session', to: 'review' },
  { from: 'working', event: 'submit', actors: S, guard: 'script', to: 'review' },
  // The Steward stopped while the script ran, so the run says nothing: the quest is open again and runs anew (P1-17).
  { from: 'working', event: 'release', actors: S, guard: 'script', to: 'open' },
  { from: 'working', event: 'ask', actors: R, to: 'blocked' },
  { from: 'working', event: 'mana_out', actors: M, guard: 'session', to: 'paused_mana' },
  { from: 'working', event: 'breaker', actors: S, to: 'infirmary' },
  { from: 'working', event: 'crash', actors: S, guard: 'can_retry', to: 'returned' },
  { from: 'working', event: 'crash', actors: S, guard: 'out_of_retries', to: 'infirmary' },
  { from: 'working', event: 'suspend', actors: U, guard: 'session', to: 'returned' },
  { from: 'working', event: 'cancel', actors: U, to: 'archived' },
  { from: 'paused_mana', event: 'mana_restored', actors: M, to: 'working' },
  // The Steward too, once the quest slept past mana.reassign_after_hours (P1-22, §3.5).
  { from: 'paused_mana', event: 'reassign', actors: US, to: 'claimed' },
  // The owner suspends the character asleep on it: the quest lets go of it and opens again for anyone (P1-22).
  { from: 'paused_mana', event: 'suspend', actors: U, to: 'open' },
  { from: 'paused_mana', event: 'cancel', actors: U, to: 'archived' },
  { from: 'paused_mana', event: 'breaker', actors: S, to: 'infirmary' },
  { from: 'blocked', event: 'answer', actors: U, guard: 'has_assignee', to: 'working' },
  { from: 'blocked', event: 'answer', actors: U, guard: 'no_assignee', to: 'open' },
  { from: 'blocked', event: 'unblock', actors: S, guard: 'no_assignee', to: 'open' },
  { from: 'blocked', event: 'cancel', actors: U, to: 'archived' },
  { from: 'review', event: 'assign_verifier', actors: S, guard: 'needs_verifier', to: 'review' },
  { from: 'review', event: 'verdict_pass', actors: VS, guard: 'no_seal', to: 'done' },
  { from: 'review', event: 'verdict_pass', actors: VS, guard: 'seal_required', to: 'awaiting_seal' },
  { from: 'review', event: 'verdict_fail', actors: VS, guard: 'can_retry', to: 'returned' },
  { from: 'review', event: 'verdict_fail', actors: VS, guard: 'out_of_retries', to: 'infirmary' },
  { from: 'review', event: 'mana_out', actors: M, guard: 'has_verifier', to: 'review' },
  { from: 'review', event: 'breaker', actors: S, guard: 'has_verifier', to: 'review' },
  { from: 'review', event: 'breaker', actors: S, guard: 'needs_verifier', to: 'infirmary' },
  // The verifier's session ended with no verdict (its CLI failed, or the Steward restarted under it): the
  // verifier leaves as on a breaker and the next one takes the review (P1-03).
  { from: 'review', event: 'crash', actors: S, guard: 'has_verifier', to: 'review' },
  { from: 'review', event: 'suspend', actors: U, guard: 'has_verifier', to: 'review' },
  { from: 'review', event: 'cancel', actors: U, to: 'archived' },
  { from: 'returned', event: 'redispatch', actors: S, to: 'working' },
  { from: 'returned', event: 'reassign', actors: U, to: 'claimed' },
  { from: 'returned', event: 'cancel', actors: U, to: 'archived' },
  { from: 'returned', event: 'breaker', actors: S, to: 'infirmary' },
  { from: 'awaiting_seal', event: 'seal', actors: U, to: 'done' },
  { from: 'awaiting_seal', event: 'return', actors: U, guard: 'session', to: 'returned' },
  { from: 'awaiting_seal', event: 'reject', actors: U, to: 'archived' },
  { from: 'done', event: 'deliver', actors: S, guard: 'undelivered', to: 'done' },
  { from: 'done', event: 'archive', actors: US, to: 'archived' },
  { from: 'infirmary', event: 'retry', actors: U, guard: 'no_stalled_review', to: 'open' },
  // A review the breakers kept cutting goes on, same run, with a new judge (P1-26): opening it would redo the work.
  { from: 'infirmary', event: 'retry', actors: U, guard: 'stalled_review', to: 'review' },
  { from: 'infirmary', event: 'reassign', actors: U, guard: 'session', to: 'claimed' },
  { from: 'infirmary', event: 'archive', actors: U, to: 'archived' },
];

/** `review.verdict_fail.can_retry`: names a row in tests and in the rendered table. */
export const rowKey = (row: QuestTransitionRow): string =>
  [row.from, row.event, ...(row.guard === undefined ? [] : [row.guard])].join('.');
