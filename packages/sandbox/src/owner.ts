// The owner's part of a fake day: what the inbox brings (ADR 0005), some minutes after a quest started waiting.
// A quest waiting for the seal is sealed, a question is answered once its asker is free again, and a quest in the
// infirmary is retried when the scenario says so. Each is a command the Steward applies (command.applied), then
// the quest's move by the owner.
import { currentRun } from '@elvaria/domain';
import type { Quest, QuestId } from '@elvaria/domain';

import { isFree } from './day.ts';
import { holderOf, step } from './ledger.ts';
import { judged, levelAfterVerdict, verdictIdOf } from './reputation.ts';
import { answerFor, openSession } from './work.ts';
import type { Day } from './day.ts';

function applied(day: Day): void {
  day.ledger.note({
    type: 'command.applied',
    actor: { kind: 'steward' },
    data: { command_id: day.ids.ulid() },
  });
}

/** The royal seal: a human verdict on the assignee's work, weighed three times (§2.6). */
function seal(day: Day, quest: Quest): void {
  const assignee = holderOf(quest, 'assignee');
  const verdict = verdictIdOf(quest, currentRun(quest));
  applied(day);
  day.ledger.move(quest.id, { type: 'seal' }, 'user', { [assignee]: judged(quest, verdict, 'pass', true) });
  levelAfterVerdict(day, assignee);
}

/** The answer goes into a fresh session of the same attempt, so it waits until the asker is free (§2.5). */
function answer(day: Day, quest: Quest): boolean {
  const assignee = holderOf(quest, 'assignee');
  if (!isFree(day, day.ledger.character(assignee))) return false;
  applied(day);
  openSession(day, (session) =>
    day.ledger.move(quest.id, { type: 'answer', answer: answerFor(day), session_id: session }, 'user', {
      [assignee]: step('claim', quest.id),
    }),
  );
  return true;
}

function retry(day: Day, quest: Quest): void {
  applied(day);
  day.ledger.move(quest.id, { type: 'retry' }, 'user');
}

/** Whether the owner is done with the quest: acted, or the quest no longer waits for them. */
function act(day: Day, quest: Quest): boolean {
  if (quest.status === 'awaiting_seal') {
    seal(day, quest);
    return true;
  }
  if (quest.status === 'blocked') return answer(day, quest);
  if (quest.status === 'infirmary') retry(day, quest);
  return true;
}

export function ownerActs(day: Day): void {
  const due: QuestId[] = [...day.owner]
    .filter(([, minute]) => minute <= day.clock.minute())
    .map(([id]) => id);
  // A quest acted on leaves the list; if it waits for the owner again later, noteWaits puts it back.
  for (const id of due) if (act(day, day.ledger.quest(id))) day.owner.delete(id);
}
