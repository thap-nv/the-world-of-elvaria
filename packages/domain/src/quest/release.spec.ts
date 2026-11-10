// A session that ended while no Steward ran (P1-44, P1-37 (c)): the Steward that starts lets go of its run with
// `release`, which counts for nothing. The character's attempt is given back, so the redispatch that follows takes
// it again; a verifier leaves the review without counting toward a stalled one.
import { describe, expect, it } from 'vitest';

import { BRANN, SESSION, THORN, at, eventOf, questIn, walk } from './__fixtures__/quests.ts';
import { transition } from './transition.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { QuestActor } from './events.ts';

const release = (quest: Quest, actor: QuestActor = 'steward') =>
  transition(quest, eventOf('release', quest, at(50)), actor);

const value = (result: ReturnType<typeof transition>): Quest => {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
};

const runs = (quest: Quest) => quest.attempt_log.map(({ n, role, outcome }) => [n, role, outcome]);

describe("release of a character's session that ended while no Steward ran", () => {
  it('gives the attempt back to the same character, and the redispatch takes it again', () => {
    const working = questIn('working');
    expect(working.attempts).toBe(1);
    const released = value(release(working));
    expect(released).toMatchObject({ status: 'returned', assignee: THORN, attempts: 0 });
    expect(runs(released)).toEqual([[1, 'assignee', 'cancelled']]);
    const again = walk(released, ['redispatch']);
    expect(again).toMatchObject({ status: 'working', assignee: THORN, attempts: 1 });
    expect(runs(again)).toEqual([
      [1, 'assignee', 'cancelled'],
      [2, 'assignee', undefined],
    ]);
  });

  it('returns a quest on its last attempt, where a crash sends it to the infirmary', () => {
    const last = questIn('working', { ...SESSION, max_attempts: 1 });
    expect(value(transition(last, eventOf('crash', last, at(50)), 'steward')).status).toBe('infirmary');
    expect(value(release(last))).toMatchObject({ status: 'returned', attempts: 0 });
  });

  it("is the Steward's alone", () => {
    expect(release(questIn('working'), 'user')).toMatchObject({
      ok: false,
      error: { code: 'actor_not_allowed' },
    });
  });
});

describe("release of a verifier's session that ended while no Steward ran", () => {
  const judged = walk(questIn('review'), ['assign_verifier']);

  it('lets the verifier leave the review to the next judge, its entry cancelled', () => {
    expect(judged).toMatchObject({ verifier: BRANN });
    const released = value(release(judged));
    expect(released).toMatchObject({ status: 'review', assignee: THORN, verifier: null, attempts: 1 });
    expect(runs(released)).toEqual([
      [1, 'assignee', 'submitted'],
      [1, 'verifier', 'cancelled'],
    ]);
  });

  it('needs a verifier to let go of', () => {
    expect(release(questIn('review'))).toMatchObject({ ok: false, error: { code: 'guard_failed' } });
  });
});
