// The probe of a red delivery train (CM-08b): the patrol's plan over the train's merges, and who leaves how.
import { describe, expect, it } from 'vitest';

import { probeNextOf } from './probe.ts';
import { trainProbePlanOf, trainSplitOf } from './train-probe.ts';
import type { QuestId } from '../core/ids.ts';
import type { ProbeRun } from './probe.ts';

const [Q1, Q2, Q3] = ['q_20261127_aaaaa1', 'q_20261127_aaaaa2', 'q_20261127_aaaaa3'] as const as readonly [
  QuestId,
  QuestId,
  QuestId,
];
const sha = (letter: string) => letter.repeat(40);
const BASE = sha('0');
const STEPS = [
  { quest: Q1, commit: sha('1'), head: sha('a') },
  { quest: Q2, commit: sha('2'), head: sha('b') },
  { quest: Q3, commit: sha('3'), head: sha('c') },
];

describe('trainProbePlanOf', () => {
  it("chains the train's merges from its base, each step a quest's merge", () => {
    expect(trainProbePlanOf({ base: BASE, head: sha('3'), steps: STEPS })).toEqual({
      red: sha('3'),
      steps: [
        { commit: sha('1'), parent: BASE, quest: Q1, head: sha('a') },
        { commit: sha('2'), parent: sha('1'), quest: Q2, head: sha('b') },
        { commit: sha('3'), parent: sha('2'), quest: Q3, head: sha('c') },
      ],
    });
  });

  it("folds the generators' commit into the last quest's step", () => {
    const plan = trainProbePlanOf({ base: BASE, head: sha('9'), steps: STEPS });
    expect(plan.red).toBe(sha('9'));
    expect(plan.steps.at(-1)).toEqual({ commit: sha('9'), parent: sha('2'), quest: Q3, head: sha('c') });
  });

  it('finds the middle quest red on its own head: own_change, no outside step', () => {
    const plan = trainProbePlanOf({ base: BASE, head: sha('3'), steps: STEPS });
    const run = (commit: string, red: boolean, quest?: QuestId): ProbeRun => ({
      commit,
      red,
      duration_ms: 1,
      ...(quest === undefined ? {} : { quest }),
    });
    const runs = [run(sha('1'), false), run(sha('2'), true), run(sha('2'), true)];
    expect(probeNextOf(plan, runs)).toEqual({ kind: 'own', step: plan.steps[1] });
    expect(probeNextOf(plan, [...runs, run(sha('b'), true, Q2)])).toEqual({
      kind: 'done',
      cause: 'own_change',
      commit: sha('2'),
      culprit: Q2,
    });
  });
});

describe('trainSplitOf', () => {
  const quests = [Q1, Q2, Q3];

  it('sends the quests before the culprit off at once, and those after it back to the platform', () => {
    const done = { kind: 'done', cause: 'combination', commit: sha('2'), culprit: Q2 } as const;
    expect(trainSplitOf(done, quests)).toEqual({ culprit: Q2, before: [Q1], after: [Q3] });
    expect(trainSplitOf({ ...done, culprit: Q1 }, quests)).toEqual({
      culprit: Q1,
      before: [],
      after: [Q2, Q3],
    });
  });

  it('sends every quest back when the probe blamed none, or one not aboard', () => {
    expect(trainSplitOf({ kind: 'done', cause: 'unknown' }, quests)).toEqual({ before: [], after: quests });
    const stranger = 'q_20261127_bbbbb1' as QuestId;
    const done = { kind: 'done', cause: 'own_change', culprit: stranger } as const;
    expect(trainSplitOf(done, quests)).toEqual({ before: [], after: quests });
  });
});
