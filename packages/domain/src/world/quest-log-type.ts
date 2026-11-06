// The event type that names a quest move in the log (glossary §12: one quest.* line per move of the table in
// implementation-plan §2.5). The reducer reads the view and ignores the name, but the world animates by name
// and the chronicle tells by name, so the Steward (P1-03) and the sandbox (P0-10) take it from here.
import type { EventType } from '../schema/event/event-types.ts';
import type { QuestStatus } from '../schema/quest/shared.ts';
import type { QuestEventType } from '../quest/events.ts';

export type QuestLogType = Extract<EventType, `quest.${string}`>;

/** Where the quest lands says it best: the infirmary, a verdict waiting for the seal. */
const BY_TARGET: Partial<Record<QuestStatus, QuestLogType>> = {
  infirmary: 'quest.infirmary',
  awaiting_seal: 'quest.verdict',
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
  return: 'quest.returned',
  seal: 'quest.sealed',
  deliver: 'quest.delivered',
  cancel: 'quest.archived',
  reject: 'quest.archived',
  archive: 'quest.archived',
};

/**
 * The log type of the move `event` from `from` to `to`. A verifier that leaves a review early (mana_out, breaker,
 * suspend: the quest stays in review without it) leaves a partial verdict, so the line is a verdict.
 */
export function questLogTypeOf(event: QuestEventType, from: QuestStatus, to: QuestStatus): QuestLogType {
  const verifierLeft = from === 'review' && to === 'review' && event !== 'assign_verifier';
  return BY_TARGET[to] ?? (verifierLeft ? 'quest.verdict' : BY_EVENT[event]);
}
