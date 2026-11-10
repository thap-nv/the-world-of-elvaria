// The event type that names a quest move in the log (glossary §12: one quest.* line per move of the table in
// implementation-plan §2.5). The reducer reads the view and ignores the name, but the world animates by name
// and the chronicle tells by name, so the Steward (P1-03) and the sandbox (P0-10) take it from here.
import type { EventType } from '../schema/event/event-types.ts';
import type { QuestStatus } from '../schema/quest/shared.ts';
import type { QuestEventType } from '../quest/events.ts';

/**
 * The quest lines that carry the quest's view. `quest.unclaimable` is a notice about an open quest, not a change
 * to it (P1-03), so it has data of its own and no move of the table is named by it.
 */
export type QuestLogType = Exclude<Extract<EventType, `quest.${string}`>, 'quest.unclaimable'>;

/**
 * Where the quest lands says it best: the infirmary, a verdict waiting for the seal, back with its character (a
 * crash, a fail, the owner's return, or a session the Steward lost while it did not run, P1-44).
 */
const BY_TARGET: Partial<Record<QuestStatus, QuestLogType>> = {
  infirmary: 'quest.infirmary',
  awaiting_seal: 'quest.verdict',
  returned: 'quest.returned',
};

/** Otherwise the move itself. */
const BY_EVENT: Readonly<Record<QuestEventType, QuestLogType>> = {
  confirm: 'quest.created',
  discard: 'quest.archived',
  claim: 'quest.claimed',
  reassign: 'quest.claimed',
  block: 'quest.blocked',
  ask: 'quest.blocked',
  release: 'quest.released',
  // Back to open with nobody holding it, as after a failed spawn.
  retry: 'quest.released',
  start: 'quest.started',
  redispatch: 'quest.started',
  // A verifier's session starts on the quest (§2.5: assign_verifier opens its entry in attempt_log).
  assign_verifier: 'quest.started',
  submit: 'quest.submitted',
  mana_out: 'quest.paused',
  mana_restored: 'quest.resumed',
  answer: 'quest.unblocked',
  unblock: 'quest.unblocked',
  breaker: 'quest.infirmary',
  crash: 'quest.returned',
  suspend: 'quest.returned',
  verdict_pass: 'quest.done',
  verdict_fail: 'quest.returned',
  // From review to review, which questLogTypeOf names a verdict before it reads this, or to the infirmary (P1-42).
  verdict_partial: 'quest.verdict',
  return: 'quest.returned',
  seal: 'quest.sealed',
  deliver: 'quest.delivered',
  cancel: 'quest.archived',
  reject: 'quest.archived',
  archive: 'quest.archived',
};

/**
 * The log type of the move `event` from `from` to `to`. A verifier that leaves a review early (mana_out, breaker,
 * crash, release, suspend: the quest stays in review without it) leaves a partial verdict, so the line is a verdict. A retry
 * of a review the breakers kept cutting hands the work to judging again, as a submit does (P1-26).
 */
export function questLogTypeOf(event: QuestEventType, from: QuestStatus, to: QuestStatus): QuestLogType {
  if (event === 'retry' && to === 'review') return 'quest.submitted';
  // A suspended sleeper's paused quest opens again with nobody holding it, as after a failed spawn (P1-22).
  if (event === 'suspend' && to === 'open') return 'quest.released';
  const verifierLeft = from === 'review' && to === 'review' && event !== 'assign_verifier';
  return BY_TARGET[to] ?? (verifierLeft ? 'quest.verdict' : BY_EVENT[event]);
}
