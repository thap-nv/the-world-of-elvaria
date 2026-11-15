import { describe, expect, it } from 'vitest';

import {
  NOW,
  Q1,
  Q2,
  Q3,
  Q4,
  character,
  inReview,
  moved,
  quest,
  snapshot,
  workingBy,
} from '../dispatch/__fixtures__/snapshot.ts';
import { planTick } from '../dispatch/plan-tick.ts';
import { breakersOf, turnCeilingOf, wrapUpsOf } from './breakers.ts';
import type { HeldSession, SessionRules } from './breakers.ts';

const RULES = { max_turns: 200, verifier_tokens_multiplier: 2 };
const held = (
  id: HeldSession['quest'],
  role: HeldSession['role'],
  tokens = 0,
  turns?: number,
): HeldSession => ({
  quest: id,
  role,
  usage: turns === undefined ? { tokens } : { tokens, turns },
});
const judged = moved(inReview(quest(Q2), 'thorn', 10), 110, [
  'assign_verifier',
  'steward',
  { verifier: 'wren' },
]);
const thorn = character('thorn', { tribe: 'claude', status: 'working' });
const wren = character('wren', { tribe: 'gemini', status: 'working' });
const rules: SessionRules = {
  ...RULES,
  characters: new Map([
    ['thorn', thorn],
    ['wren', wren],
  ]),
  tribes: [
    { id: thorn.tribe, max_turns: 100 },
    { id: wren.tribe, max_turns: 400 },
  ],
};

describe('turnCeilingOf', () => {
  it('reads the assignee or verifier tribe and falls back when context or an override is absent', () => {
    const working = workingBy(quest(Q1), 'thorn', 110);
    expect(turnCeilingOf(working, 'assignee', rules)).toBe(100);
    expect(turnCeilingOf(judged, 'verifier', rules)).toBe(400);
    expect(turnCeilingOf(working, 'assignee', RULES)).toBe(200);
    expect(turnCeilingOf(quest(Q1), 'verifier', rules)).toBe(200);
    expect(turnCeilingOf(working, 'assignee', { ...rules, characters: new Map() })).toBe(200);
    expect(turnCeilingOf(working, 'assignee', { ...rules, tribes: [] })).toBe(200);
    expect(turnCeilingOf(working, 'assignee', { ...rules, tribes: [{ id: thorn.tribe }] })).toBe(200);
  });
});

describe('wrapUpsOf', () => {
  it('reports held sessions in order, with nominal ceilings and verifier token multiplier', () => {
    const quests = [workingBy(quest(Q1), 'thorn', 110), judged];
    const sessions = [held(Q2, 'verifier', 720_000), held(Q1, 'assignee', 360_000)];
    expect(wrapUpsOf(quests, sessions, RULES, NOW)).toEqual([
      {
        quest: Q2,
        role: 'verifier',
        kind: 'wrap_up',
        measure: 'tokens',
        used: 720_000,
        limit: 800_000,
        pct: 90,
      },
      {
        quest: Q1,
        role: 'assignee',
        kind: 'wrap_up',
        measure: 'tokens',
        used: 360_000,
        limit: 400_000,
        pct: 90,
      },
    ]);
    expect(breakersOf(quests, sessions, RULES, NOW)).toEqual([]);
  });

  it('uses configured percentages and tribe ceilings for warnings and hard stops', () => {
    const quests = [workingBy(quest(Q1), 'thorn', 110), judged];
    const configured = { ...rules, soft_pct: 50, hard_pct: 200 };
    const sessions = [held(Q1, 'assignee', 0, 60), held(Q2, 'verifier', 0, 801)];
    expect(wrapUpsOf(quests, sessions, configured, NOW)).toEqual([
      { quest: Q1, role: 'assignee', kind: 'wrap_up', measure: 'turns', used: 60, limit: 100, pct: 60 },
    ]);
    expect(breakersOf(quests, sessions, configured, NOW)).toEqual([
      {
        quest: Q2,
        role: 'verifier',
        trip: 'turns',
        detail: '801 turns, limit 800',
        params: { turns: 801, limit: 800 },
      },
    ]);
  });

  it('skips gone quests, missing or unreadable open entries, healthy sessions and hard stops', () => {
    const working = workingBy(quest(Q1), 'thorn', 110);
    const unreadable = {
      ...working,
      id: Q2,
      attempt_log: working.attempt_log.map((entry) => ({ ...entry, started_at: 'not a time' })),
    };
    const quests = [working, unreadable, workingBy(quest(Q3), 'thorn', 10)];
    expect(
      wrapUpsOf(
        quests,
        [held(Q1, 'verifier'), held(Q2, 'assignee'), held(Q3, 'assignee'), held(Q4, 'assignee')],
        rules,
        NOW,
      ),
    ).toEqual([]);
    expect(wrapUpsOf(quests, [held(Q1, 'assignee')], rules, NOW)).toEqual([]);
  });

  it('uses only time for minutes_only tribes, including soft warnings', () => {
    const quests = [workingBy(quest(Q1), 'thorn', 80)];
    const sessions = [held(Q1, 'assignee', 999_999, 999)];
    expect(wrapUpsOf(quests, sessions, rules, NOW, () => 'minutes_only')).toEqual([
      { quest: Q1, role: 'assignee', kind: 'wrap_up', measure: 'time', used: 40, limit: 45, pct: 4000 / 45 },
    ]);
    expect(breakersOf(quests, sessions, rules, NOW, () => 'minutes_only')).toEqual([]);
  });
});

it('planTick applies each holder tribe turn ceiling on the real breaker call', () => {
  const quests = [workingBy(quest(Q1), 'thorn', 110), judged];
  const base = snapshot(quests, [thorn, wren], {
    sessions: [held(Q1, 'assignee', 0, 151), held(Q2, 'verifier', 0, 301)],
  });
  const kingdom = {
    ...base.kingdom,
    tribes: base.kingdom.tribes.map((tribe) => ({
      ...tribe,
      max_turns: tribe.id === thorn.tribe ? 100 : 400,
    })),
  };
  expect(planTick({ ...base, kingdom }, NOW).breakers).toEqual([
    {
      quest: Q1,
      role: 'assignee',
      trip: 'turns',
      detail: '151 turns, limit 150',
      params: { turns: 151, limit: 150 },
    },
  ]);
});
