// What an event changes in a quest besides its status (implementation-plan §2.5): who holds it, the attempt
// counter, the attempt log, the question, the seal, the delivery. One effect per event type; the row of
// QUEST_TRANSITIONS has already been chosen, and `to` is its target status.
import { aboveCeiling } from '../character/level.ts';
import { err, ok } from '../core/result.ts';
import { machineMergeDue } from '../party/machine-merge.ts';
import { closeRun, currentRun, entryOf } from './attempt-log.ts';
import type { CharacterId } from '../core/ids.ts';
import type { Result } from '../core/result.ts';
import type { Role } from '../schema/common.ts';
import type { Attempt } from '../schema/quest/quest-parts.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { QuestStatus } from '../schema/quest/shared.ts';
import type { QuestEvent, QuestEventOf, QuestEventType, RunEnd } from './events.ts';
import type { QuestTransitionError } from './transition-error.ts';

type Outcome = NonNullable<Attempt['outcome']>;
type Effect<T extends QuestEventType> = (
  quest: Quest,
  event: QuestEventOf<T>,
  to: QuestStatus,
) => Result<Quest, QuestTransitionError>;

const same = (quest: Quest): Result<Quest, never> => ok(quest);

/** Whose session holds the quest in a status: the assignee's while working, the verifier's in review. */
const HOLDER: Partial<Record<QuestStatus, Role>> = { working: 'assignee', review: 'verifier' };

/** Ends the session holding the quest, if one is open. */
function endRun(quest: Quest, event: RunEnd & { readonly at: string }, outcome: Outcome): Quest {
  const role = HOLDER[quest.status];
  if (role === undefined) return quest;
  return { ...quest, attempt_log: closeRun(quest.attempt_log, role, { at: event.at, outcome, run: event }) };
}

const withoutVerifier = (quest: Quest): Quest => ({ ...quest, verifier: null });
/** A verifier whose session ends early leaves; the next one reads its partial verdict on (§2.5). */
const dropVerifierInReview = (quest: Quest): Quest =>
  quest.status === 'review' ? withoutVerifier(quest) : quest;

const ending =
  (outcome: Outcome) =>
  (quest: Quest, event: RunEnd & { readonly at: string }): Result<Quest, never> =>
    ok(dropVerifierInReview(endRun(quest, event, outcome)));

/** An assignee session of run `n`: the assignee's, or the Steward's own for a script (character null). */
const assigneeRun = (quest: Quest, n: number, at: string, session_id: string | undefined) =>
  entryOf(quest, { n, role: 'assignee', character: quest.assignee ?? null, at, session_id });

/** A new attempt: the counter that `budget.max_attempts` limits goes up, and so does the run number. */
function startAttempt(quest: Quest, event: QuestEventOf<'start' | 'redispatch'>): Result<Quest, never> {
  const entry = assigneeRun(quest, currentRun(quest) + 1, event.at, event.session_id);
  return ok({ ...quest, attempts: quest.attempts + 1, attempt_log: [...quest.attempt_log, entry] });
}

/**
 * The same attempt goes on in a fresh session, rebuilt from handover.md and the journal (principle 13, ADR 0017):
 * after mana comes back, or after the owner answered the character's question.
 */
function resume(quest: Quest, at: string, session_id: string | undefined): Quest {
  const entry = assigneeRun(quest, currentRun(quest), at, session_id);
  return { ...quest, attempt_log: [...quest.attempt_log, entry] };
}

const askedAt = (question: string, at: string) => ({ question, asked_at: at });

/**
 * A character takes the quest. Above its level's ceiling the quest waits for the royal seal, whoever chose the
 * character (owner, after P0-04); the machine never lowers seal_required again.
 */
const takenBy = (quest: Quest, by: { readonly assignee: CharacterId; readonly level: number }): Quest => ({
  ...quest,
  assignee: by.assignee,
  seal_required: quest.seal_required || aboveCeiling(by.level, quest.rank),
});

/**
 * Nobody takes a script, nor the first run of a party's merge quest, which the Steward makes itself (P1-18); every
 * other quest is taken by a character.
 */
function claim(quest: Quest, event: QuestEventOf<'claim'>): Result<Quest, QuestTransitionError> {
  const mismatch = { code: 'invalid_event', reason: 'assignee_for_tier' } as const;
  if (event.assignee === null)
    return quest.tier === 'script' || machineMergeDue(quest)
      ? ok({ ...quest, assignee: null })
      : err(mismatch);
  return quest.tier === 'session' ? ok(takenBy(quest, event)) : err(mismatch);
}

function answer(
  quest: Quest,
  event: QuestEventOf<'answer'>,
  to: QuestStatus,
): Result<Quest, QuestTransitionError> {
  const { blocked } = quest;
  if (blocked === undefined) return err({ code: 'invalid_quest', issues: ['a blocked quest needs blocked'] });
  const answered = { ...quest, blocked: { ...blocked, answer: event.answer, answered_at: event.at } };
  return ok(to === 'working' ? resume(answered, event.at, event.session_id) : answered);
}

function assignVerifier(
  quest: Quest,
  event: QuestEventOf<'assign_verifier'>,
): Result<Quest, QuestTransitionError> {
  const { verifier } = event;
  const worked =
    verifier === quest.assignee ||
    quest.attempt_log.some((entry) => entry.role === 'assignee' && entry.character === verifier);
  if (worked) return err({ code: 'invalid_event', reason: 'verifier_worked' });
  const run = { n: currentRun(quest), role: 'verifier', character: verifier, at: event.at } as const;
  return ok({
    ...quest,
    verifier,
    attempt_log: [...quest.attempt_log, entryOf(quest, { ...run, session_id: event.session_id })],
  });
}

const EFFECTS: { readonly [T in QuestEventType]: Effect<T> } = {
  confirm: same,
  discard: same,
  reject: same,
  archive: same,
  unblock: same,
  claim,
  // A claim that never started, or a script run the Steward cut short (its entry ends `cancelled`, P1-17).
  release: (quest, event) => ok({ ...endRun(quest, event, 'cancelled'), assignee: null }),
  // The owner hands the quest to someone new; out of the infirmary that someone gets the full attempt budget.
  reassign: (quest, event) =>
    ok({ ...takenBy(quest, event), ...(quest.status === 'infirmary' ? { attempts: 0 } : {}) }),
  block: (quest, event) => ok({ ...quest, blocked: askedAt(event.question, event.at) }),
  start: startAttempt,
  redispatch: startAttempt,
  submit: ending('submitted'),
  ask: (quest, event) =>
    ok({ ...endRun(quest, event, 'blocked'), blocked: askedAt(event.question, event.at) }),
  mana_out: ending('paused'),
  breaker: (quest, event) => ending(event.trip === 'time' ? 'timeout' : 'breaker')(quest, event),
  crash: ending('crash'),
  cancel: (quest, event) => ok(endRun(quest, event, 'cancelled')),
  // The assignee's attempt ends as returned (§2.6); a suspended verifier's session is simply cut short. A quest
  // paused for mana has no session left (its run ended paused): it opens again without its sleeper (P1-22).
  suspend: (quest, event, to) =>
    to === 'open'
      ? ok({ ...quest, assignee: null })
      : ending(quest.status === 'working' ? 'returned' : 'cancelled')(quest, event),
  mana_restored: (quest, event) => ok(resume(quest, event.at, event.session_id)),
  answer,
  assign_verifier: assignVerifier,
  verdict_pass: (quest, event) => ok(endRun(quest, event, 'submitted')),
  // The next attempt gets a fresh verifier, chosen again once it is submitted.
  verdict_fail: (quest, event) => ok(withoutVerifier(endRun(quest, event, 'submitted'))),
  // The judge handed in how far it read and leaves; the next one reads on. Its session handed in a verdict, so it
  // ends `submitted`, not `crash`: a partial verdict is progress, not a stalled review (P1-33).
  verdict_partial: ending('submitted'),
  seal: (quest, event) =>
    ok({ ...quest, seal: { at: event.at, ...(event.note === undefined ? {} : { note: event.note }) } }),
  return: (quest) => ok(withoutVerifier(quest)),
  deliver: (quest, event) => ok({ ...quest, deliverable: { ...quest.deliverable, delivered_at: event.at } }),
  // A fresh start from the infirmary: nobody holds the quest and the attempt budget is full again (§2.5). A review
  // the breakers kept cutting goes back to review instead: same assignee, same attempt, a new judge (P1-26).
  retry: (quest, _event, to) =>
    ok(to === 'review' ? withoutVerifier(quest) : { ...quest, attempts: 0, assignee: null, verifier: null }),
};

/** Applies the effect of `event` to a quest that is still in its old status. */
export function applyEffect(
  quest: Quest,
  event: QuestEvent,
  to: QuestStatus,
): Result<Quest, QuestTransitionError> {
  // TypeScript cannot correlate EFFECTS[event.type] with event's own type; the mapped type above guarantees it.
  const effect = EFFECTS[event.type] as Effect<QuestEventType>;
  return effect(quest, event, to);
}
