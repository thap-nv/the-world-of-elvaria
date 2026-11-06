import { describe, expect, it } from 'vitest';

import { QuestSchema } from '../schema/quest/quest.ts';
import {
  BRANN,
  ELLA,
  THORN,
  VARIANTS,
  at,
  draftQuest,
  eventOf,
  reachable,
  seeded,
} from './__fixtures__/quests.ts';
import { BREAKER_TRIPS, QUEST_ACTORS, QUEST_EVENT_TYPES } from './events.ts';
import { questTierIssues } from './invariants.ts';
import { transition } from './transition.ts';
import { QUEST_GUARDS, QUEST_TRANSITIONS, rowKey } from './transitions.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { QuestActor, QuestEvent, QuestEventType } from './events.ts';

// Deep enough to reach every row: the longest path (three failed verdicts into the infirmary) is 13 events
// with a budget of three attempts, 6 with a budget of one.
const SAMPLES = reachable(10);
const CASES = SAMPLES.flatMap((quest) =>
  QUEST_EVENT_TYPES.flatMap((type) => QUEST_ACTORS.map((actor) => ({ quest, type, actor }))),
);

const matchingRows = (quest: Quest, type: QuestEventType) =>
  QUEST_TRANSITIONS.filter(
    (row) =>
      row.from === quest.status &&
      row.event === type &&
      (row.guard === undefined || QUEST_GUARDS[row.guard](quest)),
  );

/** The actor rule of transition(), restated: who may speak for whom. */
const holds = (quest: Quest, type: QuestEventType, actor: QuestActor): boolean => {
  if (actor === 'runner') return typeof quest.assignee === 'string';
  if (actor === 'verifier') return typeof quest.verifier === 'string';
  if (actor === 'steward' && type.startsWith('verdict_')) return typeof quest.verifier !== 'string';
  return true;
};

const attempt = (quest: Quest, type: QuestEventType, actor: QuestActor, minute = 30) =>
  transition(quest, eventOf(type, quest, at(minute)), actor);

/** The attempt log mirrors the status: a running session is an open entry, and only then. */
function expectLogMatchesStatus(quest: Quest): void {
  const open = (role: string) => quest.attempt_log.filter((e) => e.role === role && e.ended_at === undefined);
  expect(open('assignee')).toHaveLength(quest.status === 'working' ? 1 : 0);
  expect(open('verifier')).toHaveLength(quest.status === 'review' && quest.verifier ? 1 : 0);
  let latest = 0;
  for (const entry of quest.attempt_log) {
    if (entry.role === 'assignee') {
      // Run numbers never go back, so verdict ids and run folders stay unique (attempt-log.ts).
      expect(entry.n).toBeGreaterThanOrEqual(latest);
      latest = entry.n;
    } else {
      expect(entry.n).toBe(latest);
    }
  }
}

describe('the quest state machine, over every state it reaches', () => {
  it('explores a state space that covers all twelve statuses and both tiers', () => {
    expect(new Set(SAMPLES.map((quest) => quest.status)).size).toBe(12);
    expect(new Set(SAMPLES.map((quest) => quest.tier)).size).toBe(2);
  });

  it('takes every row of the table on some reachable quest', () => {
    const taken = new Set<string>();
    for (const { quest, type, actor } of CASES) {
      if (attempt(quest, type, actor).ok) taken.add(rowKey(matchingRows(quest, type)[0]!));
    }
    expect(QUEST_TRANSITIONS.map(rowKey).filter((key) => !taken.has(key))).toEqual([]);
  });

  it('never moves a quest outside the table', () => {
    for (const { quest, type, actor } of CASES) {
      const result = attempt(quest, type, actor);
      if (!result.ok) continue;
      const [row, ...others] = matchingRows(quest, type);
      expect(others).toEqual([]);
      expect(row!.actors).toContain(actor);
      expect(result.value.status).toBe(row!.to);
    }
  });

  it('never needs two rows: the guards of rows sharing status and event exclude each other', () => {
    for (const quest of SAMPLES) {
      for (const type of QUEST_EVENT_TYPES) expect(matchingRows(quest, type).length).toBeLessThanOrEqual(1);
    }
  });

  it('takes a matching row from every actor of the row who holds the quest', () => {
    for (const { quest, type, actor } of CASES) {
      const [row] = matchingRows(quest, type);
      if (row === undefined || !row.actors.includes(actor) || !holds(quest, type, actor)) continue;
      expect(attempt(quest, type, actor)).toMatchObject({ ok: true, value: { status: row.to } });
    }
  });

  it('keeps the quest valid, the tiers consistent and the attempt log in step with the status', () => {
    for (const quest of SAMPLES) {
      expect(QuestSchema.safeParse(quest).success).toBe(true);
      expect(questTierIssues(quest)).toEqual([]);
      expectLogMatchesStatus(quest);
    }
  });
});

const pick = <T>(random: () => number, items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
const PEOPLE = [THORN, ELLA, BRANN] as const;
const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** An event with a random payload, valid or not: walks must also survive what the machine refuses. */
function randomEvent(random: () => number, type: QuestEventType, quest: Quest, minute: number): QuestEvent {
  const event = eventOf(type, quest, at(minute));
  if (event.type === 'claim') {
    const who = pick(random, [...PEOPLE, null]);
    return who === null
      ? { type: 'claim', at: event.at, assignee: null }
      : { type: 'claim', at: event.at, assignee: who, level: pick(random, LEVELS) };
  }
  if (event.type === 'reassign')
    return { ...event, assignee: pick(random, PEOPLE), level: pick(random, LEVELS) };
  if (event.type === 'assign_verifier') return { ...event, verifier: pick(random, PEOPLE) };
  if (event.type === 'breaker') return { ...event, trip: pick(random, BREAKER_TRIPS) };
  return event;
}

/** Mostly an event some row takes from this status, sometimes anything at all. */
function randomCause(random: () => number, quest: Quest): { type: QuestEventType; actor: QuestActor } {
  const rows = QUEST_TRANSITIONS.filter((row) => row.from === quest.status);
  if (rows.length === 0 || random() < 0.2) {
    return { type: pick(random, QUEST_EVENT_TYPES), actor: pick(random, QUEST_ACTORS) };
  }
  const row = pick(random, rows);
  return { type: row.event, actor: pick(random, row.actors) };
}

describe('the quest state machine, on long random walks', () => {
  it('stays inside the table and keeps every invariant for 60 seeded walks of 120 events', () => {
    let moves = 0;
    for (let seed = 1; seed <= 60; seed += 1) {
      const random = seeded(seed);
      let quest = draftQuest(pick(random, VARIANTS));
      for (let step = 1; step <= 120; step += 1) {
        // An archived quest goes nowhere; the walk goes on with a new draft.
        if (quest.status === 'archived') quest = draftQuest(pick(random, VARIANTS));
        const { type, actor } = randomCause(random, quest);
        const result = transition(quest, randomEvent(random, type, quest, step), actor);
        if (!result.ok) continue;
        const rows = matchingRows(quest, type);
        expect(rows).toHaveLength(1);
        expect(result.value.status).toBe(rows[0]!.to);
        expect(questTierIssues(result.value)).toEqual([]);
        expectLogMatchesStatus(result.value);
        quest = result.value;
        moves += 1;
      }
    }
    // The walks get somewhere: some events are refused, most are taken.
    expect(moves).toBeGreaterThan(3000);
  });
});
