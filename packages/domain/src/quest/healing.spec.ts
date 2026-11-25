// A healer's session (ADR 0034, plans/healer.md 4.5): `returned.heal` opens it as a doer of the quest, in the same run
// and without an attempt; it submits to review, or stops in the infirmary; one that ends without the heal (mana,
// a Steward that stopped) leaves the quest returned, so the next tick chooses again.
import { describe, expect, it } from 'vitest';

import { awaitsHeal } from '../breaker/heal.ts';
import {
  BRANN,
  ELLA,
  MIRA,
  QUEST_ID,
  REFUSED,
  THORN,
  actorOf,
  at,
  eventOf,
  questIn,
} from './__fixtures__/quests.ts';
import { transition } from './transition.ts';
import type { CharacterId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { QuestActor, QuestEvent, QuestEventType } from './events.ts';

const WREN = 'wren' as CharacterId;
let minute = 10;
const tryMove = (quest: Quest, event: QuestEvent, actor: QuestActor = 'steward') =>
  transition(quest, event, actor);
function move(quest: Quest, event: QuestEvent, actor: QuestActor = 'steward'): Quest {
  const result = tryMove(quest, event, actor);
  if (!result.ok) throw new Error(`${quest.status} -> ${event.type}: ${JSON.stringify(result.error)}`);
  return result.value;
}
const next = (quest: Quest, type: QuestEventType): Quest =>
  move(quest, eventOf(type, quest, at((minute += 1))), actorOf(quest, type));
const healBy = (healer: CharacterId): QuestEvent => ({ type: 'heal', at: at((minute += 1)), healer });
const refuse = (quest: Quest): Quest => move(quest, { type: 'breaker', at: at((minute += 1)), ...REFUSED });
const entries = (quest: Quest) =>
  quest.attempt_log.map(({ n, role, character, heal, outcome }) => [n, role, character, heal, outcome]);

describe('returned.heal', () => {
  it('opens the healer entry in the same run, its folder heal/, the attempt and the assignee kept', () => {
    const healing = questIn('healing');
    expect(healing).toMatchObject({ status: 'healing', assignee: THORN, attempts: 1 });
    expect(healing.attempt_log.at(-1)).toEqual({
      n: 1,
      character: MIRA,
      role: 'assignee',
      started_at: healing.attempt_log.at(-1)?.started_at,
      session_id: 's-heal',
      run_dir: `.runs/${QUEST_ID}-1/heal`,
      heal: 'session',
    });
  });

  it('takes only a run that waits for its heal', () => {
    for (const quest of [questIn('returned'), next(refuse(questIn('working')), 'redispatch')]) {
      const returned = quest.status === 'returned' ? quest : next(quest, 'release');
      expect(tryMove(returned, healBy(MIRA))).toEqual({
        ok: false,
        error: { code: 'guard_failed', from: 'returned', event: 'heal', guards: ['awaits_heal'] },
      });
    }
  });

  it('refuses the doer, which heals through redispatch, and whoever judged the quest', () => {
    const due = refuse(questIn('working'));
    expect(tryMove(due, healBy(THORN))).toEqual({
      ok: false,
      error: { code: 'invalid_event', reason: 'healer_is_assignee' },
    });
    const failed = next(next(questIn('review'), 'assign_verifier'), 'verdict_fail');
    const dueAgain = refuse(next(failed, 'redispatch'));
    expect(dueAgain).toMatchObject({ status: 'returned', attempts: 2 });
    expect(tryMove(dueAgain, healBy(BRANN))).toEqual({
      ok: false,
      error: { code: 'invalid_event', reason: 'healer_judged' },
    });
    expect(tryMove(dueAgain, healBy(MIRA)).ok).toBe(true);
  });

  it('is the Steward move only', () => {
    expect(tryMove(refuse(questIn('working')), healBy(MIRA), 'user')).toMatchObject({
      ok: false,
      error: { code: 'actor_not_allowed' },
    });
  });
});

describe('the end of a healer session', () => {
  it('submits to review as a doer: the healer may not judge it, another judge may', () => {
    const review = next(questIn('healing'), 'submit');
    expect(review).toMatchObject({ status: 'review', attempts: 1, verifier: null });
    expect(entries(review).at(-1)).toEqual([1, 'assignee', MIRA, 'session', 'submitted']);
    const byHealer = { type: 'assign_verifier', at: at(50), verifier: MIRA } as const;
    expect(tryMove(review, byHealer)).toEqual({
      ok: false,
      error: { code: 'invalid_event', reason: 'verifier_worked' },
    });
    expect(next(review, 'assign_verifier').verifier).toBe(BRANN);
  });

  it('takes no submit from the runner: the Steward commits the heal', () => {
    const submit = eventOf('submit', questIn('healing'), at(50));
    expect(tryMove(questIn('healing'), submit, 'runner')).toMatchObject({
      error: { code: 'actor_not_allowed' },
    });
  });

  it.each(['breaker', 'crash'] as const)(
    'stops in the infirmary on %s, where the owner may submit it',
    (type) => {
      const stopped = next(questIn('healing'), type);
      expect(stopped).toMatchObject({ status: 'infirmary', assignee: THORN, attempts: 1 });
      expect(next(stopped, 'submit').status).toBe('review');
    },
  );

  it.each([
    ['mana_out', 'paused'],
    ['release', 'cancelled'],
  ] as const)('goes back on %s with the heal still due, no attempt given or taken', (type, outcome) => {
    const back = next(questIn('healing'), type);
    expect(back).toMatchObject({ status: 'returned', assignee: THORN, attempts: 1 });
    expect(entries(back).at(-1)).toEqual([1, 'assignee', MIRA, 'session', outcome]);
    expect(awaitsHeal(back)).toBe(true);
    const again = move(back, healBy(WREN));
    expect(entries(again).at(-1)).toEqual([1, 'assignee', WREN, 'session', undefined]);
    const doer = next(back, 'redispatch');
    expect(doer).toMatchObject({ status: 'working', attempts: 1 });
    expect(entries(doer).at(-1)).toEqual([1, 'assignee', THORN, 'session', undefined]);
    // The run had its heal: the doer's refusal now goes to the infirmary.
    expect(refuse(doer).status).toBe('infirmary');
  });

  it('is cancelled by the owner into the archive', () => {
    expect(next(questIn('healing'), 'cancel')).toMatchObject({ status: 'archived' });
  });

  it('leaves a run its heal: a reassign from the infirmary opens a new run with a heal of its own', () => {
    const stopped = next(questIn('healing'), 'breaker');
    const reassigned = next(next(stopped, 'reassign'), 'start');
    expect(reassigned).toMatchObject({ assignee: ELLA, attempts: 1 });
    expect(refuse(reassigned)).toMatchObject({ status: 'returned' });
  });
});
