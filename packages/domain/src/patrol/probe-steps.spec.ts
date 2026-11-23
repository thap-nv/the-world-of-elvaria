// The steps of a probe (CM-04): the quest branches the log knows, the latest green head of the red checks, the first-
// parent line from it to the red head with each merge named by its quest, and a quest's own head before its newest
// merge of the base branch.
import { describe, expect, it } from 'vitest';

import { SHA_A, TERRITORY, delivered, ran } from './__fixtures__/patrol-log.ts';
import { greenHeadOf, probeStepsOf, questHeadOf, questTipsOf } from './probe-steps.ts';
import type { QuestId, TerritoryId } from '../core/ids.ts';

const HERE = TERRITORY as TerritoryId;
const Q1 = 'q_20261123_aaaaa1' as QuestId;
const Q2 = 'q_20261123_aaaaa2' as QuestId;
const sha = (letter: string): string => letter.repeat(40);
const [G, C1, C2, C3, H1, H2, B, U, V, P] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map(sha) as [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];
const TS = '2026-11-23T10:00:00+07:00';

describe('questTipsOf', () => {
  it("a quest's merge replaces its push; another territory's lines are not read", () => {
    const events = [
      delivered(TS, Q1, H1),
      delivered(TS, Q2, H2),
      delivered(TS, Q1, H1, C2),
      ran(TS, [{ id: 'unit', pass: true }]),
    ];
    expect(questTipsOf(events, HERE)).toEqual([
      { quest: Q1, head: H1, merge_sha: C2 },
      { quest: Q2, head: H2 },
    ]);
    expect(questTipsOf(events, 'other' as TerritoryId)).toEqual([]);
  });
});

describe('greenHeadOf', () => {
  const green = { id: 'unit', pass: true };
  it('the head of the latest patrol that found every red check green', () => {
    const events = [
      ran(TS, [green, { id: 'lint', pass: true }], { head: G }),
      ran(TS, [green, { id: 'lint', pass: false }], { head: C1 }),
      ran(TS, [{ id: 'unit', pass: false }], { head: C2 }),
    ];
    expect(greenHeadOf(events, HERE, ['unit'])).toBe(C1);
    expect(greenHeadOf(events, HERE, ['unit', 'lint'])).toBe(G);
    expect(greenHeadOf(events, 'other' as TerritoryId, ['unit'])).toBeUndefined();
  });

  it('a patrol with no head, no plot, or a check it did not run is not green; `setup` is commands.setup', () => {
    const setup = { pass: true, log_path: '.runs/patrol-elvaria/setup.log' };
    const events = [
      ran(TS, [green], { head: G, setup }),
      ran(TS, [green], { head: C1, setup: { ...setup, pass: false } }),
      ran(TS, [green], { head: null }),
      ran(TS, [], { head: C2, plot_failure: 'no default branch', setup: null }),
    ];
    expect(greenHeadOf(events, HERE, ['setup', 'unit'])).toBe(G);
    expect(greenHeadOf(events, HERE, ['unit'])).toBe(C1);
    expect(greenHeadOf(events, HERE, ['lint'])).toBeUndefined();
    expect(greenHeadOf([ran(TS, [green], { head: SHA_A })], HERE, ['setup'])).toBe(SHA_A);
  });
});

describe('probeStepsOf', () => {
  // G ← C1 (the owner's commit) ← C2 (the Steward's merge of Q1) ← C3 (Q2's branch merged by hand), newest first.
  const links = [
    { commit: C3, parents: [C2, H2] },
    { commit: H2, parents: [C1] },
    { commit: C2, parents: [C1, H1] },
    { commit: H1, parents: [G] },
    { commit: C1, parents: [G] },
  ];
  const tips = [
    { quest: Q1, head: H1, merge_sha: C2 },
    { quest: Q2, head: H2 },
  ];

  it('the first-parent line, oldest first, each merge named by its quest', () => {
    expect(probeStepsOf(links, { green: G, red: C3 }, tips)).toEqual([
      { commit: C1, parent: G },
      { commit: C2, parent: C1, quest: Q1, head: H1 },
      { commit: C3, parent: C2, quest: Q2, head: H2 },
    ]);
  });

  it('a squash merge is named by its commit; a root commit has no parent', () => {
    const squash = [{ commit: C1, parents: [G] }];
    expect(probeStepsOf(squash, { green: G, red: C1 }, [{ quest: Q1, head: H1, merge_sha: C1 }])).toEqual([
      { commit: C1, parent: G, quest: Q1, head: H1 },
    ]);
    expect(probeStepsOf([{ commit: C1, parents: [] }], { green: G, red: C1 }, [])).toBeUndefined();
  });

  it('no step when the green head is the red one; none either when green is off the line', () => {
    expect(probeStepsOf([], { green: G, red: G }, tips)).toEqual([]);
    expect(probeStepsOf(links, { green: B, red: C3 }, tips)).toBeUndefined();
  });
});

describe('questHeadOf', () => {
  it("the first parent of the queue's merge of the base branch, past its generators' commit", () => {
    // P (generators) ← U = merge(V, B), B on the base side (not listed); V ← H1 = the quest's merge of a part.
    const links = [
      { commit: P, parents: [U] },
      { commit: U, parents: [V, B] },
      { commit: V, parents: [H1, H2] },
      { commit: H1, parents: [G] },
      { commit: H2, parents: [G] },
    ];
    expect(questHeadOf(links, P)).toBe(V);
  });

  it('the head itself when its branch took in nothing of the base side, or git listed nothing', () => {
    const links = [
      { commit: V, parents: [H1, H2] },
      { commit: H1, parents: [G] },
      { commit: H2, parents: [G] },
    ];
    expect(questHeadOf(links, V)).toBe(V);
    expect(questHeadOf([{ commit: V, parents: [] }], V)).toBe(V);
    expect(questHeadOf([], V)).toBe(V);
  });
});
