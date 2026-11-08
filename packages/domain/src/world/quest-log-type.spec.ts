import { describe, expect, it } from 'vitest';

import { QUEST_ACTORS, QUEST_EVENT_TYPES } from '../quest/events.ts';
import { at, eventOf, reachable } from '../quest/__fixtures__/quests.ts';
import { transition } from '../quest/transition.ts';
import { QUEST_TRANSITIONS } from '../quest/transitions.ts';
import { hasDataSchema } from '../schema/event/event-data.ts';
import { EventSchema } from '../schema/event/event.ts';
import { KINGDOM } from './__fixtures__/examples.ts';
import { questLogTypeOf } from './quest-log-type.ts';
import { questViewOf } from './quest-view.ts';
import { applyEvent } from './reduce.ts';
import { worldStateOf } from './world-state.ts';
import type { Quest } from '../schema/quest/quest.ts';

const stateWith = (quest: Quest) =>
  worldStateOf({ kingdom: KINGDOM, territories: [], characters: [], quests: [quest], campaigns: [] });

describe('questLogTypeOf', () => {
  it('names every row of the transition table with a quest type whose line carries a view', () => {
    for (const { event, from, to } of QUEST_TRANSITIONS) {
      const type = questLogTypeOf(event, from, to);
      expect(type, `${from} ${event} ${to}`).toMatch(/^quest\./);
      expect(hasDataSchema(type)).toBe(true);
    }
  });

  it.each([
    ['confirm', 'draft', 'open', 'quest.created'],
    ['discard', 'draft', 'archived', 'quest.archived'],
    ['claim', 'open', 'claimed', 'quest.claimed'],
    ['reassign', 'infirmary', 'claimed', 'quest.claimed'],
    ['release', 'claimed', 'open', 'quest.released'],
    ['retry', 'infirmary', 'open', 'quest.released'],
    ['retry', 'infirmary', 'review', 'quest.submitted'],
    ['start', 'claimed', 'working', 'quest.started'],
    ['redispatch', 'returned', 'working', 'quest.started'],
    ['assign_verifier', 'review', 'review', 'quest.started'],
    ['ask', 'working', 'blocked', 'quest.blocked'],
    ['answer', 'blocked', 'working', 'quest.unblocked'],
    ['mana_out', 'working', 'paused_mana', 'quest.paused'],
    ['mana_restored', 'paused_mana', 'working', 'quest.resumed'],
    ['breaker', 'working', 'infirmary', 'quest.infirmary'],
    ['crash', 'working', 'returned', 'quest.returned'],
    ['crash', 'working', 'infirmary', 'quest.infirmary'],
    ['verdict_pass', 'review', 'done', 'quest.done'],
    ['verdict_pass', 'review', 'awaiting_seal', 'quest.verdict'],
    ['verdict_fail', 'review', 'returned', 'quest.returned'],
    ['verdict_fail', 'review', 'infirmary', 'quest.infirmary'],
    // The verifier leaves the review early with a partial verdict; the quest waits for the next one.
    ['mana_out', 'review', 'review', 'quest.verdict'],
    ['breaker', 'review', 'review', 'quest.verdict'],
    ['suspend', 'review', 'review', 'quest.verdict'],
    ['suspend', 'working', 'returned', 'quest.returned'],
    ['suspend', 'paused_mana', 'open', 'quest.released'],
    ['seal', 'awaiting_seal', 'done', 'quest.sealed'],
    ['return', 'awaiting_seal', 'returned', 'quest.returned'],
    ['deliver', 'done', 'done', 'quest.delivered'],
    ['cancel', 'working', 'archived', 'quest.archived'],
  ] as const)('%s from %s to %s is %s', (event, from, to, type) => {
    expect(questLogTypeOf(event, from, to)).toBe(type);
  });
});

describe('a quest line for every move the machine makes', () => {
  // Every quest the machine reaches in eight events, every event, every actor: the line the Steward would
  // write is valid, and reducing it gives the view of the quest file after the move.
  const moves = reachable(8).flatMap((before) =>
    QUEST_EVENT_TYPES.flatMap((type) =>
      QUEST_ACTORS.flatMap((actor) => {
        const result = transition(before, eventOf(type, before, at(30)), actor);
        return result.ok ? [{ before, type, after: result.value }] : [];
      }),
    ),
  );

  it('covers every row of the table', () => {
    expect(moves.length).toBeGreaterThan(QUEST_TRANSITIONS.length);
  });

  it('writes a valid line whose view the reducer puts in place', () => {
    for (const { before, type, after } of moves) {
      const logType = questLogTypeOf(type, before.status, after.status);
      const event = EventSchema.parse({
        v: 1,
        id: '01JCF8X4Z6Q3W9N2M5R7T8V0YB',
        ts: after.updated_at,
        type: logType,
        actor: { kind: 'steward' },
        quest: after.id,
        data: {
          ...(logType === 'quest.infirmary' ? { reason: 'max_attempts' } : {}),
          quest: questViewOf(after),
        },
      });
      const quests = applyEvent(stateWith(before), event).quests;
      expect(quests[after.id]).toEqual(after.status === 'archived' ? undefined : questViewOf(after));
    }
  });
});
