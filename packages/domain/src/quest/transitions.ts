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
  | 'by_character'
  | 'by_machine'
  | 'merged_by_machine'
  | 'can_retry'
  | 'machine_retry'
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

/**
 * A character works the quest: a session quest's assignee. A script-tier quest has none, nor has the first run of a
 * party's merge quest, which the Steward makes itself (P1-18 (h), `machineMergeDue`): the machine submits those.
 */
const byCharacter = (quest: Quest): boolean => quest.tier === 'session' && typeof quest.assignee === 'string';
const underBudget = (quest: Quest): boolean => quest.attempts < quest.budget.max_attempts;

/** A script-tier quest has no character to retry it: a crash or a fail goes to the infirmary (§2.5). */
const canRetry = (quest: Quest): boolean => byCharacter(quest) && underBudget(quest);

/** A session quest the machine worked: the Steward's merge of a party's parts (P1-18), with no character to go back to. */
const mergedByMachine = (quest: Quest): boolean =>
  quest.tier === 'session' && typeof quest.assignee !== 'string';

/** The machine's run of a session quest failed its judge: open again, so a character takes the next run (P1-18). */
const machineRetry = (quest: Quest): boolean => mergedByMachine(quest) && underBudget(quest);

export const QUEST_GUARDS: Readonly<Record<QuestGuard, (quest: Quest) => boolean>> = {
  session: (quest) => quest.tier === 'session',
  by_character: byCharacter,
  by_machine: (quest) => !byCharacter(quest),
  merged_by_machine: mergedByMachine,
  can_retry: canRetry,
  machine_retry: machineRetry,
  out_of_retries: (quest) => !canRetry(quest) && !machineRetry(quest),
  seal_required: (quest) => quest.seal_required,
  no_seal: (quest) => !quest.seal_required,
  has_assignee: (quest) => typeof quest.assignee === 'string',
  no_assignee: (quest) => typeof quest.assignee !== 'string',
  // A script-tier quest is judged by the machine and never gets a character as verifier (closes a gap of v1).
  needs_verifier: (quest) => quest.tier === 'session' && typeof quest.verifier !== 'string',
  has_verifier: (quest) => typeof quest.verifier === 'string',
  // Delivery stamps deliverable.delivered_at instead of being a status of its own, so it happens once.
  undelivered: (quest) => quest.deliverable.delivered_at === undefined,
  // REVIEW_BREAKS_MAX verifiers of the run left without a verdict, cut by a breaker (P1-23), crashed (P1-33) or
  // unable to open a session (fix/review-no-session), or REVIEW_PARTIALS_MAX handed in a partial one (P1-42): the
  // work is done, only its review stalled.
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
const V = ['verifier'] as const;
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
  { from: 'working', event: 'submit', actors: R, guard: 'by_character', to: 'review' },
  // A script's run, or the merge of a party's parts the Steward made itself (P1-18).
  { from: 'working', event: 'submit', actors: S, guard: 'by_machine', to: 'review' },
  // The Steward stopped while the script ran, so the run says nothing: the quest is open again and runs anew (P1-17).
  // A merge of the parts that stopped on a conflict leaves it to a knight the same way (P1-18).
  { from: 'working', event: 'release', actors: S, guard: 'by_machine', to: 'open' },
  // A character's session ended while no Steward ran (it stopped or was killed): the run says nothing, so the same
  // character goes on in a fresh session and the attempt is not counted (P1-44, P1-37 (c)).
  { from: 'working', event: 'release', actors: S, guard: 'by_character', to: 'returned' },
  { from: 'working', event: 'ask', actors: R, to: 'blocked' },
  { from: 'working', event: 'mana_out', actors: M, guard: 'by_character', to: 'paused_mana' },
  { from: 'working', event: 'breaker', actors: S, to: 'infirmary' },
  { from: 'working', event: 'crash', actors: S, guard: 'can_retry', to: 'returned' },
  { from: 'working', event: 'crash', actors: S, guard: 'out_of_retries', to: 'infirmary' },
  { from: 'working', event: 'suspend', actors: U, guard: 'by_character', to: 'returned' },
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
  // The judge chosen could not open its session (fix/review-no-session): it leaves the review as a crashed judge
  // does, counted toward REVIEW_BREAKS_MAX, and `review.crash.needs_verifier` follows once the review stalls.
  { from: 'review', event: 'no_session', actors: S, guard: 'needs_verifier', to: 'review' },
  { from: 'review', event: 'verdict_pass', actors: VS, guard: 'no_seal', to: 'done' },
  { from: 'review', event: 'verdict_pass', actors: VS, guard: 'seal_required', to: 'awaiting_seal' },
  { from: 'review', event: 'verdict_fail', actors: VS, guard: 'can_retry', to: 'returned' },
  // The machine's merge failed its judge: no character to send it back to, so it opens for a knight (P1-18).
  { from: 'review', event: 'verdict_fail', actors: VS, guard: 'machine_retry', to: 'open' },
  { from: 'review', event: 'verdict_fail', actors: VS, guard: 'out_of_retries', to: 'infirmary' },
  // A judge hands in how far it read and leaves the rest to the next judge (P1-33: before, a crash carried it).
  { from: 'review', event: 'verdict_partial', actors: V, guard: 'has_verifier', to: 'review' },
  // Right after the row above, once REVIEW_PARTIALS_MAX judges of the run handed in a partial verdict (P1-42): a
  // judge that cannot finish the ritual would otherwise be followed by another, each with its session and trial.
  { from: 'review', event: 'verdict_partial', actors: S, guard: 'needs_verifier', to: 'infirmary' },
  { from: 'review', event: 'mana_out', actors: M, guard: 'has_verifier', to: 'review' },
  { from: 'review', event: 'breaker', actors: S, guard: 'has_verifier', to: 'review' },
  { from: 'review', event: 'breaker', actors: S, guard: 'needs_verifier', to: 'infirmary' },
  // The verifier's session ended with no verdict (its CLI failed, or its output was none): the verifier leaves as
  // on a breaker and the next one takes the review (P1-03).
  { from: 'review', event: 'crash', actors: S, guard: 'has_verifier', to: 'review' },
  // Right after the row above, once REVIEW_BREAKS_MAX verifiers of the run left without a verdict (P1-33): a judge
  // whose output is never a verdict would otherwise cost a session every tick, for ever. As `review.breaker`.
  { from: 'review', event: 'crash', actors: S, guard: 'needs_verifier', to: 'infirmary' },
  // The verifier's session ended while no Steward ran: it leaves, and counts toward no stalled review (P1-44).
  { from: 'review', event: 'release', actors: S, guard: 'has_verifier', to: 'review' },
  { from: 'review', event: 'suspend', actors: U, guard: 'has_verifier', to: 'review' },
  { from: 'review', event: 'cancel', actors: U, to: 'archived' },
  { from: 'returned', event: 'redispatch', actors: S, to: 'working' },
  { from: 'returned', event: 'reassign', actors: U, to: 'claimed' },
  { from: 'returned', event: 'cancel', actors: U, to: 'archived' },
  { from: 'returned', event: 'breaker', actors: S, to: 'infirmary' },
  { from: 'awaiting_seal', event: 'seal', actors: U, to: 'done' },
  { from: 'awaiting_seal', event: 'return', actors: U, guard: 'by_character', to: 'returned' },
  // The owner returns the machine's merge of the parts: a knight takes the next run, reading the owner's verdict (P1-18).
  { from: 'awaiting_seal', event: 'return', actors: U, guard: 'merged_by_machine', to: 'open' },
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
