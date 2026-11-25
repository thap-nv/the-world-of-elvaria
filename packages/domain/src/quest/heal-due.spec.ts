// One heal per run (ADR 0034, plans/healer.md 4.1, 4.5): the first submit commit of a run that the hooks refuse sends
// the quest back to its doer with the attempt kept; a heal session that is refused again, or cut by a ceiling, goes to
// the infirmary. The doer's heal session keeps the other rows of `working` (a crash is a new attempt).
import { describe, expect, it } from 'vitest';

import { ELLA, LEVEL, MERGE, SCRIPT, THORN, actorOf, at, eventOf, questIn } from './__fixtures__/quests.ts';
import { transition } from './transition.ts';
import type { InfirmaryReasonCode } from '../infirmary/reasons.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { BreakerTrip, QuestActor, QuestEvent, QuestEventType } from './events.ts';

let minute = 1;
function move(quest: Quest, event: QuestEvent, actor: QuestActor = 'steward'): Quest {
  const result = transition(quest, event, actor);
  if (!result.ok) throw new Error(`${quest.status} -> ${event.type}: ${JSON.stringify(result.error)}`);
  return result.value;
}
const next = (quest: Quest, type: QuestEventType): Quest =>
  move(quest, eventOf(type, quest, at((minute += 1))), actorOf(quest, type));

const breaker = (trip: BreakerTrip, reason?: InfirmaryReasonCode, progress?: boolean): QuestEvent => ({
  type: 'breaker',
  at: at((minute += 1)),
  trip,
  ...(reason === undefined ? {} : { reason }),
  ...(progress === undefined ? {} : { progress }),
});
const refuse = (quest: Quest, reason: InfirmaryReasonCode = 'breaker:commit_errors'): Quest =>
  move(quest, breaker('commit', reason));
/** The first refusal of the run, and the redispatch that opens the doer's heal session. */
const healing = (quest: Quest): Quest => next(refuse(quest), 'redispatch');
const runs = (quest: Quest) => quest.attempt_log.map(({ n, role, heal }) => [n, role, heal ?? null]);

describe('the first refusal of a run', () => {
  it('goes back to its doer with no new attempt, its entry marked due', () => {
    const refused = refuse(questIn('working'));
    expect(refused).toMatchObject({ status: 'returned', assignee: THORN, attempts: 1 });
    expect(refused.attempt_log).toMatchObject([{ n: 1, outcome: 'breaker', heal: 'due' }]);
    expect(refused.attempt_log[0]?.ended_at).toBeDefined();
  });

  it('is healed in a fresh session of the same run: attempts and n unchanged', () => {
    const healed = healing(questIn('working'));
    expect(healed).toMatchObject({ status: 'working', assignee: THORN, attempts: 1 });
    expect(runs(healed)).toEqual([
      [1, 'assignee', 'due'],
      [1, 'assignee', 'session'],
    ]);
    expect(healed.attempt_log[1]).toMatchObject({ run_dir: '.runs/q_20261106_7k3m2a-1' });
    expect(healed.attempt_log[1]?.ended_at).toBeUndefined();
  });

  it('takes the plain refusal code as well', () => {
    expect(refuse(questIn('working'), 'breaker:commit').status).toBe('returned');
  });

  it('is healed after a cut that went on earlier in the run', () => {
    const revived = next(move(questIn('working'), breaker('tokens', undefined, true)), 'redispatch');
    expect(refuse(revived).status).toBe('returned');
  });

  it('sends the work of a heal session that passes its commit to review', () => {
    expect(next(healing(questIn('working')), 'submit').status).toBe('review');
  });
});

describe('what a heal never takes', () => {
  it('sends a refusal again in the heal session to the infirmary', () => {
    const second = refuse(healing(questIn('working')));
    expect(second).toMatchObject({ status: 'infirmary', attempts: 1, assignee: THORN });
    expect(runs(second)).toEqual([
      [1, 'assignee', 'due'],
      [1, 'assignee', 'session'],
    ]);
  });

  it.each(['tokens', 'time', 'turns'] as const)('sends a heal session cut by %s to the infirmary', (trip) => {
    const cut = move(healing(questIn('working')), breaker(trip, undefined, true));
    expect(cut).toMatchObject({ status: 'infirmary', attempts: 1 });
  });

  it.each([
    ['commit', 'breaker:patch'],
    ['commit', 'breaker:setup'],
    ['forbidden_paths', 'breaker:forbidden_paths'],
    ['secrets', 'breaker:secrets_refused'],
    ['secrets', 'breaker:secrets_missing'],
    ['secrets', 'breaker:treasury_unreadable'],
    ['no_session', 'breaker:no_session'],
  ] as const)('never heals trip %s with %s', (trip, reason) => {
    expect(move(questIn('working'), breaker(trip, reason)).status).toBe('infirmary');
  });

  it('keeps the way to the infirmary when the Steward names no reason (kingdom.heal.enabled off)', () => {
    expect(move(questIn('working'), breaker('commit')).status).toBe('infirmary');
  });

  it('ignores a healable reason on a ceiling: the cut keeps its own rule', () => {
    const cut = move(questIn('working'), breaker('tokens', 'breaker:commit', false));
    expect(cut.status).toBe('returned');
    expect(cut.attempt_log[0]).toMatchObject({ progress: false });
    expect(cut.attempt_log[0]?.heal).toBeUndefined();
  });

  it('has no heal for a script or for the machine merge of a party', () => {
    expect(refuse(questIn('working', SCRIPT)).status).toBe('infirmary');
    expect(refuse(questIn('working', MERGE)).status).toBe('infirmary');
  });
});

describe('a heal session on the other rows of working', () => {
  it('stays a heal session across a pause for mana and an answer', () => {
    const woke = next(next(healing(questIn('working')), 'mana_out'), 'mana_restored');
    expect(woke.attempt_log.at(-1)).toMatchObject({ n: 1, heal: 'session' });
    const answered = next(next(woke, 'ask'), 'answer');
    expect(answered.attempt_log.at(-1)).toMatchObject({ n: 1, heal: 'session' });
    expect(refuse(answered).status).toBe('infirmary');
  });

  it('counts a crash of the heal session as a new attempt, whose run has a heal of its own', () => {
    const retried = next(next(healing(questIn('working')), 'crash'), 'redispatch');
    expect(retried).toMatchObject({ status: 'working', attempts: 2 });
    expect(retried.attempt_log.at(-1)).toMatchObject({ n: 2 });
    expect(retried.attempt_log.at(-1)?.heal).toBeUndefined();
    expect(refuse(retried).status).toBe('returned');
  });

  it('gives a new run its heal after the infirmary and a retry, or a reassign', () => {
    const stopped = refuse(healing(questIn('working')));
    const again = next(next(next(stopped, 'retry'), 'claim'), 'start');
    expect(again.attempt_log.at(-1)).toMatchObject({ n: 2 });
    expect(refuse(again).status).toBe('returned');
    const given = move(
      refuse(questIn('working')),
      {
        type: 'reassign',
        at: at((minute += 1)),
        assignee: ELLA,
        level: LEVEL,
      },
      'user',
    );
    expect(refuse(next(given, 'start')).status).toBe('returned');
  });
});
