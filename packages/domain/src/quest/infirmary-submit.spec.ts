// The owner sends the work a quest in the infirmary holds to review (fix/quest-hold, §2.5 `infirmary.submit`): same
// run, same attempt, a new judge. Only a character's work waits there: not a stalled review, which has `retry`, nor a
// quest no session ran for, nor the machine's work.
import { describe, expect, it } from 'vitest';

import { BRANN, ELLA, SCRIPT, THORN, at, questIn, walk } from './__fixtures__/quests.ts';
import { transition } from './transition.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { QuestActor, QuestEvent } from './events.ts';

/** An event without its time, one member per event type. */
type Untimed<E = QuestEvent> = E extends QuestEvent ? Omit<E, 'at'> : never;

let minute = 40;
function move(quest: Quest, event: Untimed, actor: QuestActor): Quest {
  minute += 1;
  const result = transition(quest, { ...event, at: at(minute) }, actor);
  if (!result.ok) throw new Error(`${quest.status} -> ${event.type}: ${JSON.stringify(result.error)}`);
  return result.value;
}

/** A session cut twice in a row without progress (ADR 0030): the infirmary, the work on the branch. */
function cutTwice(): Quest {
  const cut = move(questIn('working'), { type: 'breaker', trip: 'tokens', progress: false }, 'steward');
  const revived = move(cut, { type: 'redispatch' }, 'steward');
  return move(revived, { type: 'breaker', trip: 'tokens', progress: false }, 'steward');
}

const submitted = (quest: Quest): Quest => move(quest, { type: 'submit' }, 'user');

describe('infirmary.submit', () => {
  it('sends the work of a cut session to review: same assignee, attempt and run, no judge yet', () => {
    const sick = cutTwice();
    expect(sick).toMatchObject({ status: 'infirmary', assignee: THORN, attempts: 1 });
    const review = submitted(sick);
    expect(review).toMatchObject({ status: 'review', assignee: THORN, verifier: null, attempts: 1 });
    expect(review.attempt_log).toEqual(sick.attempt_log);
  });

  it('is the owner’s move only', () => {
    const result = transition(cutTwice(), { type: 'submit', at: at(90) }, 'runner');
    expect(result).toMatchObject({ ok: false, error: { code: 'actor_not_allowed' } });
  });

  it('takes the work of a crashed session too (a crash at the attempt limit)', () => {
    const sick = walk(questIn('working'), ['crash', 'redispatch', 'crash', 'redispatch', 'crash']);
    expect(sick.status).toBe('infirmary');
    expect(submitted(sick).status).toBe('review');
  });

  it('judges the run it was cut in, and a fail sends it back to its character for a new attempt', () => {
    const judged = move(submitted(cutTwice()), { type: 'assign_verifier', verifier: BRANN }, 'steward');
    expect(judged.attempt_log.at(-1)).toMatchObject({ n: 1, role: 'verifier', character: BRANN });
    const failed = move(judged, { type: 'verdict_fail' }, 'verifier');
    expect(failed).toMatchObject({ status: 'returned', assignee: THORN, verifier: null });
    // The cut before the review left `progress` on its entry; the judge's entry after it makes this a new attempt.
    const again = move(failed, { type: 'redispatch' }, 'steward');
    expect(again).toMatchObject({ status: 'working', attempts: 2 });
    expect(again.attempt_log.at(-1)).toMatchObject({ n: 2, role: 'assignee', character: THORN });
  });

  it('passes to done as any review does', () => {
    const judged = move(submitted(cutTwice()), { type: 'assign_verifier', verifier: ELLA }, 'steward');
    expect(move(judged, { type: 'verdict_pass' }, 'verifier').status).toBe('done');
  });

  it('refuses a stalled review: its last session was a judge’s, and `retry` sends it back to review', () => {
    const judged = move(questIn('review'), { type: 'assign_verifier', verifier: BRANN }, 'steward');
    const left = move(judged, { type: 'crash' }, 'steward');
    const stalled = move(left, { type: 'crash' }, 'steward');
    expect(stalled.status).toBe('infirmary');
    expect(transition(stalled, { type: 'submit', at: at(90) }, 'user')).toMatchObject({
      ok: false,
      error: { code: 'guard_failed', guards: ['assignee_last'] },
    });
  });

  it('refuses a quest no session ran for, and the machine’s work', () => {
    const neverRan = move(questIn('claimed'), { type: 'breaker', trip: 'secrets' }, 'steward');
    expect(neverRan).toMatchObject({ status: 'infirmary', attempt_log: [] });
    const script = questIn('infirmary', SCRIPT);
    for (const quest of [neverRan, script])
      expect(transition(quest, { type: 'submit', at: at(90) }, 'user')).toMatchObject({
        ok: false,
        error: { code: 'guard_failed' },
      });
  });
});
