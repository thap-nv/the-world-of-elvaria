import { expect, it } from 'vitest';

import { NOW, Q1, Q2, character, quest, snapshot, workingBy } from '../dispatch/__fixtures__/snapshot.ts';
import { planTick } from '../dispatch/plan-tick.ts';
import { breakersOf, wrapUpsOf } from './breakers.ts';
import { calibrationOf } from './calibration.ts';
import type { HeldSession } from './breakers.ts';

const thorn = character('thorn');
const working = workingBy(quest(Q1, { rank: 'F' }), thorn.id, 119);
const samples = Array.from({ length: 10 }, (_, index) => ({
  ...workingBy(quest(`q_20261106_aaaa${String(index).padStart(2, '0')}`), thorn.id, 10),
  status: 'archived' as const,
  attempt_log: working.attempt_log.map((entry) => ({
    ...entry,
    ended_at: entry.started_at,
    tokens: 800_000,
    turns: 20,
  })),
}));
const base = snapshot([...samples, working], [thorn]);
const characters = new Map([[thorn.id, thorn]]);
const rules = { ...base.kingdom.breakers, characters };
const calibration = calibrationOf(base.quests, characters, base.kingdom);
const held = (tokens: number, turns = 0): HeldSession[] => [
  { quest: Q1, role: 'assignee', usage: { tokens, turns } },
];

it('uses the same calibrated token and turn ceilings for soft warnings and hard stops', () => {
  expect(wrapUpsOf([working], held(700_000), rules, NOW, undefined, calibration)).toMatchObject([
    { measure: 'tokens', limit: 800_000 },
  ]);
  expect(breakersOf([working], held(1_200_001), rules, NOW, undefined, calibration)).toMatchObject([
    { trip: 'tokens', params: { limit: 1_200_000 } },
  ]);
  expect(breakersOf([working], held(0, 31), rules, NOW, undefined, calibration)).toMatchObject([
    { trip: 'turns', params: { limit: 30 } },
  ]);
  expect(breakersOf([working], held(700_000), rules, NOW)).toMatchObject([{ trip: 'tokens' }]);
});

it('planTick recalibrates from its snapshot at ten samples, independently of other tribes', () => {
  expect(planTick({ ...base, sessions: held(700_000) }, NOW).breakers).toEqual([]);
  expect(planTick({ ...base, sessions: held(0, 31) }, NOW).breakers).toMatchObject([{ trip: 'turns' }]);
  expect(
    planTick({ ...base, quests: [...samples.slice(1), working], sessions: held(700_000) }, NOW).breakers,
  ).toMatchObject([{ trip: 'tokens' }]);
  const other = workingBy(quest(Q2, { rank: 'F' }), 'wren', 119);
  const otherHeld: HeldSession = { quest: Q2, role: 'assignee', usage: { tokens: 700_000 } };
  const next = snapshot([...base.quests, other], [thorn, character('wren', { tribe: 'gemini' })], {
    sessions: [otherHeld],
  });
  expect(planTick(next, NOW).breakers).toMatchObject([{ quest: Q2, trip: 'tokens' }]);
});

it('keeps legacy behavior when calibration or the holder tribe cannot be found', () => {
  for (const context of [{}, { characters: new Map() }, { characters }]) {
    const fallback = { ...base.kingdom.breakers, ...context };
    const stopped = breakersOf([working], held(700_000), fallback, NOW, undefined, new Map());
    expect(stopped).toMatchObject([{ trip: 'tokens' }]);
  }
  const unheld = { ...working, assignee: null };
  const stopped = breakersOf([unheld], held(700_000), rules, NOW, undefined, calibration);
  expect(stopped).toMatchObject([{ trip: 'tokens' }]);
});
