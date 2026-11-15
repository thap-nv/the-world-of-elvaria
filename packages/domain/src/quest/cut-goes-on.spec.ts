// A character's session cut by a ceiling goes on in a fresh session when it made progress (ADR 0030, rule (F)); the
// infirmary only after two cuts in a row of one run without progress. The other trips keep their way.
import { describe, expect, it } from 'vitest';

import { LEVEL, SCRIPT, THORN, at, draftQuest, eventOf, questIn } from './__fixtures__/quests.ts';
import { CAP_TRIPS, BREAKER_TRIPS } from './events.ts';
import { transition } from './transition.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { BreakerTrip, QuestActor, QuestEvent } from './events.ts';

let minute = 1;
function move(quest: Quest, event: QuestEvent, actor: QuestActor): Quest {
  const result = transition(quest, event, actor);
  if (!result.ok) throw new Error(`${quest.status} -> ${event.type}: ${JSON.stringify(result.error)}`);
  return result.value;
}

const cutEvent = (trip: BreakerTrip, progress?: boolean): QuestEvent => {
  minute += 1;
  const at_ = at(minute);
  return progress === undefined
    ? { type: 'breaker', at: at_, trip }
    : { type: 'breaker', at: at_, trip, progress };
};
const cut = (quest: Quest, trip: BreakerTrip, progress?: boolean): Quest =>
  move(quest, cutEvent(trip, progress), 'steward');
const redispatch = (quest: Quest): Quest =>
  move(quest, eventOf('redispatch', quest, at((minute += 1))), 'steward');

/** A cut that went on, then the redispatch that opens the next session: back to `working`. */
const cutAndRevive = (quest: Quest, progress: boolean, trip: BreakerTrip = 'tokens'): Quest =>
  redispatch(cut(quest, trip, progress));

describe('a ceiling cut that goes on', () => {
  it('lets a cut with progress go on: same assignee, same attempt, same run, a fresh session', () => {
    const cutQuest = cut(questIn('working'), 'tokens', true);
    expect(cutQuest).toMatchObject({ status: 'returned', assignee: THORN, attempts: 1 });
    expect(cutQuest.attempt_log).toMatchObject([{ n: 1, outcome: 'breaker', progress: true }]);
    const revived = redispatch(cutQuest);
    expect(revived).toMatchObject({ status: 'working', assignee: THORN, attempts: 1 });
    expect(revived.attempt_log.map((entry) => entry.n)).toEqual([1, 1]);
    expect(revived.attempt_log[1]).toMatchObject({ run_dir: '.runs/q_20261106_7k3m2a-1' });
    expect(revived.attempt_log[1]?.ended_at).toBeUndefined();
  });

  it('ends a timed-out session `timeout`, as before, and goes on all the same', () => {
    const cutQuest = cut(questIn('working'), 'time', true);
    expect(cutQuest).toMatchObject({ status: 'returned' });
    expect(cutQuest.attempt_log[0]).toMatchObject({ outcome: 'timeout', progress: true });
  });

  it.each(CAP_TRIPS)('goes on after a first cut without progress (%s)', (trip) => {
    const cutQuest = cut(questIn('working'), trip, false);
    expect(cutQuest.status).toBe('returned');
    expect(cutQuest.attempt_log[0]?.progress).toBe(false);
  });

  it('sends two cuts in a row without progress to the infirmary', () => {
    const second = cut(cutAndRevive(questIn('working'), false), 'turns', false);
    expect(second).toMatchObject({ status: 'infirmary', attempts: 1, assignee: THORN });
    expect(second.attempt_log.map((entry) => [entry.n, entry.progress])).toEqual([
      [1, false],
      [1, false],
    ]);
  });

  it('goes on after a cut without progress and then one with', () => {
    const second = cut(cutAndRevive(questIn('working'), false), 'tokens', true);
    expect(second.status).toBe('returned');
  });

  it('clears the chain: a cut with progress between two without lets the next go on', () => {
    let quest = cutAndRevive(questIn('working'), false);
    quest = cutAndRevive(quest, true);
    expect(cut(quest, 'tokens', false).status).toBe('returned');
  });

  it('never stops a quest that makes progress, however often it is cut', () => {
    let quest = questIn('working');
    for (let count = 0; count < 5; count += 1) {
      quest = cutAndRevive(quest, true);
      expect(quest).toMatchObject({ status: 'working', attempts: 1 });
    }
    expect(quest.attempt_log).toHaveLength(6);
    expect(new Set(quest.attempt_log.map((entry) => entry.n))).toEqual(new Set([1]));
  });

  it('starts a new chain after the infirmary and a retry', () => {
    let quest = cut(cutAndRevive(questIn('working'), false), 'tokens', false);
    expect(quest.status).toBe('infirmary');
    quest = move(quest, eventOf('retry', quest, at((minute += 1))), 'user');
    quest = move(quest, { type: 'claim', at: at((minute += 1)), assignee: THORN, level: LEVEL }, 'steward');
    quest = move(quest, eventOf('start', quest, at((minute += 1))), 'steward');
    expect(quest).toMatchObject({ status: 'working', attempts: 1 });
    expect(quest.attempt_log.map((entry) => entry.n)).toEqual([1, 1, 2]);
    expect(cut(quest, 'time', false).status).toBe('returned');
  });

  it('counts a new attempt for a redispatch that no cut caused', () => {
    const crashed = move(questIn('working'), eventOf('crash', questIn('working'), at(40)), 'steward');
    const again = redispatch(crashed);
    expect(again).toMatchObject({ attempts: 2 });
    expect(again.attempt_log.map((entry) => entry.n)).toEqual([1, 2]);
  });
});

describe('the trips that never go on by themselves', () => {
  const others = BREAKER_TRIPS.filter((trip) => !(CAP_TRIPS as readonly string[]).includes(trip));

  it('has the four trips of the infirmary-first way', () => {
    expect(others).toEqual(['commit', 'secrets', 'forbidden_paths', 'no_session']);
  });

  it.each(others)('sends %s to the infirmary with progress, writing none on the entry', (trip) => {
    const quest = cut(questIn('working'), trip, true);
    expect(quest.status).toBe('infirmary');
    expect(quest.attempt_log[0]?.progress).toBeUndefined();
  });

  it.each(others)('does not count %s in the chain of cuts', (trip) => {
    // A cut without progress that went on, then this trip: the infirmary, whatever `progress` says.
    const revived = cutAndRevive(questIn('working'), false);
    expect(cut(revived, trip, false).status).toBe('infirmary');
    expect(cut(revived, trip, true).status).toBe('infirmary');
  });

  it('keeps the way to the infirmary when the event does not say whether the cut made progress', () => {
    expect(cut(questIn('working'), 'tokens').status).toBe('infirmary');
  });

  it('keeps a script that runs past its time in the infirmary', () => {
    const script = questIn('working', SCRIPT);
    expect(cut(script, 'time', true).status).toBe('infirmary');
    expect(transition(draftQuest(SCRIPT), cutEvent('time', true), 'steward').ok).toBe(false);
  });

  it('leaves a judge cut by a ceiling to the next judge, whatever progress says', () => {
    let quest = questIn('review');
    quest = move(quest, eventOf('assign_verifier', quest, at(50)), 'steward');
    const after = cut(quest, 'tokens', true);
    expect(after).toMatchObject({ status: 'review', verifier: null });
    expect(after.attempt_log.at(-1)?.progress).toBeUndefined();
  });
});
