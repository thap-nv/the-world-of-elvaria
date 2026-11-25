// What an event changes in a quest besides its status (implementation-plan §2.5): who holds it, the attempt
// counter, the attempt log, the question, the seal, the delivery. One effect per event type; the row of
// QUEST_TRANSITIONS has already been chosen, and `to` is its target status.
import { endedInCut, isCapTrip } from '../breaker/continue.ts';
import { awaitsHeal, healCallOf, healDueIn } from '../breaker/heal.ts';
import { aboveCeiling } from '../character/level.ts';
import { err, ok } from '../core/result.ts';
import { machineMergeDue, machineRun } from '../party/machine-merge.ts';
import { mergedLater } from '../verify/protected.ts';
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

/** Whose session holds the quest: an assignee's while working or healing (ADR 0034), a judge's in review. */
const HOLDER: Partial<Record<QuestStatus, Role>> = {
  working: 'assignee',
  healing: 'assignee',
  review: 'verifier',
};

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

/**
 * A late machine verdict fails a done quest (ADR 0033): no session holds it, so none ends. The judge who passed it
 * leaves, and so do the seal (a sealed quest is done or archived, and a pass after the rework is sealed again when the
 * quest needs it) and the delivery stamp, so `done.deliver` delivers it once more, its pull request updated. The
 * branch, the plot and `seal_required` stay.
 */
function lateFail(quest: Quest): Quest {
  const { seal: _seal, ...unsealed } = quest;
  const { delivered_at: _delivered, ...deliverable } = quest.deliverable;
  return { ...unsealed, verifier: null, deliverable };
}

/** An assignee session of run `n`: the assignee's, or the Steward's own for a script (character null). */
const assigneeRun = (quest: Quest, n: number, at: string, session_id: string | undefined) =>
  entryOf(quest, { n, role: 'assignee', character: quest.assignee ?? null, at, session_id });

/**
 * A new attempt: the counter that `budget.max_attempts` limits goes up, and so does the run number. The machine's
 * merge of a party's parts takes a run number but no attempt: no character tried anything, so the knights that come
 * after it keep the whole budget (P1-55; before, a merge quest reached the infirmary after two knight sessions).
 */
function startAttempt(quest: Quest, event: QuestEventOf<'start' | 'redispatch'>): Result<Quest, never> {
  const entry = assigneeRun(quest, currentRun(quest) + 1, event.at, event.session_id);
  const attempts = machineRun(quest) ? quest.attempts : quest.attempts + 1;
  return ok({ ...quest, attempts, attempt_log: [...quest.attempt_log, entry] });
}

/**
 * The redispatch of a quest a ceiling cut and let go on (ADR 0030), or whose refused commit went back for a heal
 * (ADR 0034), opens a fresh session of the same run: no new attempt, no new run number; so does one after a healer's
 * session that ended without the heal (awaitsHeal). Any other redispatch is a new attempt.
 */
function redispatch(quest: Quest, event: QuestEventOf<'redispatch'>): Result<Quest, never> {
  return endedInCut(quest.attempt_log) || awaitsHeal(quest)
    ? ok(resume(quest, event.at, event.session_id))
    : startAttempt(quest, event);
}

/** The assignee's latest entry with `mark` added: what its ended session leaves for the next one of the run. */
function markLastAssignee(quest: Quest, mark: Pick<Attempt, 'progress' | 'heal'>): Quest {
  const index = quest.attempt_log.findLastIndex((entry) => entry.role === 'assignee');
  const log = quest.attempt_log.map((entry, at) => (at === index ? { ...entry, ...mark } : entry));
  return { ...quest, attempt_log: log };
}

/**
 * A breaker ends the session. A character's refused commit that goes back for a heal marks its entry `due`
 * (ADR 0034), so the run's next refusal goes to the infirmary; one of its sessions cut by a ceiling keeps whether it
 * made progress (ADR 0030), which the next cut of the run reads. Other trips ignore `progress` and `reason`.
 */
function cut(quest: Quest, event: QuestEventOf<'breaker'>, to: QuestStatus): Result<Quest, never> {
  const ended = endRun(quest, event, event.trip === 'time' ? 'timeout' : 'breaker');
  // Only `working.breaker.heal_due` leads a commit trip to `returned`; the guard read the same log.
  if (to === 'returned' && healCallOf(quest.attempt_log, event) === 'heal')
    return ok(markLastAssignee(ended, { heal: 'due' }));
  const { progress } = event;
  const working = quest.status === 'working' && quest.assignee !== null;
  if (!working || progress === undefined || !isCapTrip(event.trip)) return ok(dropVerifierInReview(ended));
  return ok(markLastAssignee(ended, { progress }));
}

/**
 * The same attempt goes on in a fresh session, rebuilt from handover.md and the journal (principle 13, ADR 0017):
 * after mana comes back, after the owner answered the character's question, after a cut that goes on. In a run whose
 * refused commit went back, every such session heals (`heal: "session"`, ADR 0034): its ceilings are kingdom.heal's,
 * a cut stops it, and the calibration of (G) leaves it out.
 */
function resume(quest: Quest, at: string, session_id: string | undefined): Quest {
  const n = currentRun(quest);
  const entry = assigneeRun(quest, n, at, session_id);
  const heals = healDueIn(quest.attempt_log, n) ? { heal: 'session' as const } : {};
  return { ...quest, attempt_log: [...quest.attempt_log, { ...entry, ...heals }] };
}

/**
 * The Steward lets go of a run that says nothing; its entry ends `cancelled`. A claim that never started, a script
 * run or a merge it cut short (P1-17, P1-18) open again with nobody holding them. A character's session that ended
 * while no Steward ran goes back to the same character, its attempt given back, so the redispatch that follows takes
 * it again; a verifier's leaves the review to the next judge (P1-44).
 */
function release(quest: Quest, event: QuestEventOf<'release'>, to: QuestStatus): Quest {
  const ended = endRun(quest, event, 'cancelled');
  // A healer's session took no attempt, so it gives none back (ADR 0034).
  if (to === 'returned' && quest.status === 'healing') return ended;
  if (to === 'returned') return { ...ended, attempts: Math.max(0, quest.attempts - 1) };
  return to === 'review' ? withoutVerifier(ended) : { ...ended, assignee: null };
}

const askedAt = (question: string, at: string) => ({ question, asked_at: at });

/**
 * A character takes the quest. Above its level's ceiling the quest waits for the royal seal, whoever chose the
 * character (owner, after P0-04); the machine never lowers seal_required again. A part or the acceptance tests of a
 * party do not (mergedLater, fix/claim-step): their work reaches the base only through the merge quest, which always
 * waits for the seal, so a seal on each would have the owner seal the same change twice, as PS-04 found for a
 * protected path (verify/protected.ts).
 */
const takenBy = (quest: Quest, by: { readonly assignee: CharacterId; readonly level: number }): Quest => ({
  ...quest,
  assignee: by.assignee,
  seal_required: quest.seal_required || (aboveCeiling(by.level, quest.rank) && !mergedLater(quest)),
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

/** The verifier's entry of run n, or why `verifier` may not judge the quest: it worked on it. */
function verifierEntry(
  quest: Quest,
  event: { readonly verifier: CharacterId; readonly at: string; readonly session_id?: string | undefined },
): Result<Attempt, QuestTransitionError> {
  const { verifier } = event;
  const worked =
    verifier === quest.assignee ||
    quest.attempt_log.some((entry) => entry.role === 'assignee' && entry.character === verifier);
  if (worked) return err({ code: 'invalid_event', reason: 'verifier_worked' });
  const run = { n: currentRun(quest), role: 'verifier', character: verifier, at: event.at } as const;
  return ok(entryOf(quest, { ...run, session_id: event.session_id }));
}

function assignVerifier(
  quest: Quest,
  event: QuestEventOf<'assign_verifier'>,
): Result<Quest, QuestTransitionError> {
  const entry = verifierEntry(quest, event);
  if (!entry.ok) return entry;
  return ok({ ...quest, verifier: event.verifier, attempt_log: [...quest.attempt_log, entry.value] });
}

/**
 * The judge the Steward chose could not open its session (fix/review-no-session): its entry opens and ends at once,
 * `no_session`, and the quest stays without a verifier. It counts toward a stalled review and is passed over while
 * another judge may take the review, as a judge whose session crashed (breaker/review.ts); before, nothing was
 * written, and the Steward chose the same judge every tick.
 */
function noSession(quest: Quest, event: QuestEventOf<'no_session'>): Result<Quest, QuestTransitionError> {
  const entry = verifierEntry(quest, event);
  if (!entry.ok) return entry;
  const ended: Attempt = { ...entry.value, ended_at: event.at, outcome: 'no_session' };
  return ok({ ...quest, attempt_log: [...quest.attempt_log, ended] });
}

/**
 * A healer's session opens on the quest (ADR 0034): an entry of role `assignee`, the healer's, in the run whose
 * refused commit went back, marked `heal: "session"`, in the run's `heal/` folder (plans/healer.md 4.4). No new
 * attempt, and `quest.assignee` stays the doer's. The doer heals through `redispatch`, and nobody who judged the
 * quest becomes a doer of it (ADR 0008).
 */
function heal(quest: Quest, event: QuestEventOf<'heal'>): Result<Quest, QuestTransitionError> {
  const { healer } = event;
  if (healer === quest.assignee) return err({ code: 'invalid_event', reason: 'healer_is_assignee' });
  if (quest.attempt_log.some((entry) => entry.role === 'verifier' && entry.character === healer))
    return err({ code: 'invalid_event', reason: 'healer_judged' });
  const run = { n: currentRun(quest), role: 'assignee', character: healer, at: event.at } as const;
  const entry = entryOf(quest, { ...run, session_id: event.session_id });
  const healing: Attempt = { ...entry, run_dir: `${entry.run_dir}/heal`, heal: 'session' };
  return ok({ ...quest, attempt_log: [...quest.attempt_log, healing] });
}

const EFFECTS: { readonly [T in QuestEventType]: Effect<T> } = {
  confirm: same,
  discard: same,
  reject: same,
  archive: same,
  unblock: same,
  claim,
  release: (quest, event, to) => ok(release(quest, event, to)),
  // The owner hands the quest to someone new; out of the infirmary that someone gets the full attempt budget.
  reassign: (quest, event) =>
    ok({ ...takenBy(quest, event), ...(quest.status === 'infirmary' ? { attempts: 0 } : {}) }),
  block: (quest, event) => ok({ ...quest, blocked: askedAt(event.question, event.at) }),
  start: startAttempt,
  redispatch,
  // The owner's submit of work left in the infirmary closes no session, its run ended there; the review it opens
  // starts with no judge, so planTick chooses one (fix/quest-hold).
  submit: (quest, event) =>
    quest.status === 'infirmary' ? ok(withoutVerifier(quest)) : ending('submitted')(quest, event),
  // An amendment is a question its author decides first (PS-22b): the quest keeps which memo it waits on, and who.
  ask: (quest, event) => {
    const asked = askedAt(event.question, event.at);
    const blocked = event.amendment === undefined ? asked : { ...asked, amendment: event.amendment };
    return ok({ ...endRun(quest, event, 'blocked'), blocked });
  },
  mana_out: ending('paused'),
  breaker: cut,
  crash: ending('crash'),
  cancel: (quest, event) => ok(endRun(quest, event, 'cancelled')),
  // The assignee's attempt ends as returned (§2.6); a suspended verifier's session is simply cut short. A quest
  // paused for mana has no session left (its run ended paused): it opens again without its sleeper (P1-22).
  suspend: (quest, event, to) =>
    to === 'open'
      ? ok({ ...quest, assignee: null })
      : ending(quest.status === 'working' ? 'returned' : 'cancelled')(quest, event),
  mana_restored: (quest, event) => ok(resume(quest, event.at, event.session_id)),
  heal,
  answer,
  assign_verifier: assignVerifier,
  no_session: noSession,
  verdict_pass: (quest, event) => ok(endRun(quest, event, 'submitted')),
  // The next attempt gets a fresh verifier, chosen again once it is submitted.
  verdict_fail: (quest, event) =>
    ok(quest.status === 'done' ? lateFail(quest) : withoutVerifier(endRun(quest, event, 'submitted'))),
  // The judge handed in how far it read and leaves; the next one reads on. Its session handed in a verdict, so it
  // ends `partial`, not `crash`: progress, counted apart from a judge that left none (P1-33, P1-42). The Steward's
  // move of a review stalled on partials closes no session.
  verdict_partial: ending('partial'),
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
