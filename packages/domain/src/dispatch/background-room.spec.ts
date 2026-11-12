import { describe, expect, it } from 'vitest';

import { KINGDOM, Q1, Q2, Q3, Q4, inReview, quest } from './__fixtures__/snapshot.ts';
import { startingNow } from './background-room.ts';
import type { RoomSource } from './background-room.ts';
import type { QuestId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Registry } from '../schema/registry.ts';

// The room of machine work outside the tick (P1-54, (f) of the P1-50 report): an acceptance part needs none and goes
// first, and trials that hold every slot leave one lane to a short piece of work.
const Q5 = 'q_20261106_p4q5r6' as QuestId;

/** `build` is judged in a scratch plot (a trial); `docs` is not. */
const REGISTRY = {
  kinds: [
    { id: 'build', ritual: 'mutation_check' },
    { id: 'docs', ritual: 'editorial_review' },
  ],
  rituals: [
    { id: 'mutation_check', scratch_plot: true },
    { id: 'editorial_review', scratch_plot: false },
  ],
} as unknown as Pick<Registry, 'kinds' | 'rituals'>;

const onWorktree = (base: Quest): Quest => ({
  ...base,
  plot: { type: 'worktree', path: `D:/dc1/.elvaria/worktrees/${base.id}`, branch: `quest/${base.id}` },
});

const trial = (id: QuestId): Quest => onWorktree(inReview(quest(id, { kind: 'build' }), 'thorn'));
const short = (id: QuestId): Quest => onWorktree(inReview(quest(id, { kind: 'docs' }), 'thorn'));
const acceptance = (id: QuestId): Quest => ({ ...short(id), party_id: Q1, party_role: 'acceptance' });

const sourceOf = (
  quests: readonly Quest[],
  running: readonly QuestId[],
  more: Partial<RoomSource> = {},
): RoomSource => ({
  kingdom: KINGDOM,
  quests,
  registry: REGISTRY,
  background: { running, checked: [] },
  ...more,
});

describe('startingNow', () => {
  it('starts the checks of an acceptance part first and outside the cap', () => {
    const quests = [trial(Q1), trial(Q2), short(Q3), acceptance(Q4)];
    // Two trials hold both slots: the acceptance part's checks start all the same, ahead of the others.
    expect(startingNow(sourceOf(quests, [Q1, Q2]), [Q3, Q4], [])).toEqual({ checks: [Q4, Q3], scripts: [] });
  });

  it('runs one short piece of work beside trials that hold every slot, never a trial', () => {
    const quests = [trial(Q1), trial(Q2), short(Q3), trial(Q4), short(Q5)];
    expect(startingNow(sourceOf(quests, [Q1, Q2]), [Q4, Q3, Q5], [])).toEqual({ checks: [Q3], scripts: [] });
    // The lane is taken: the next short work waits.
    expect(startingNow(sourceOf(quests, [Q1, Q2, Q3]), [Q5], [Q4])).toEqual({ checks: [], scripts: [] });
    // A script is short work too.
    const scripts = [trial(Q1), trial(Q2), quest(Q4, { script: true })];
    expect(startingNow(sourceOf(scripts, [Q1, Q2]), [], [Q4])).toEqual({ checks: [], scripts: [Q4] });
  });

  it('gives a trial any free slot, and short work the slots short work holds no lane beside', () => {
    const quests = [trial(Q1), trial(Q2), short(Q3), short(Q4), short(Q5)];
    expect(startingNow(sourceOf(quests, [Q3]), [Q1, Q2], [])).toEqual({ checks: [Q1], scripts: [] });
    expect(startingNow(sourceOf(quests, [Q3, Q4]), [Q5], [])).toEqual({ checks: [], scripts: [] });
  });

  it('counts nothing as a trial without the kinds and rituals, and caps nothing without a background', () => {
    const quests = [trial(Q1), trial(Q2), trial(Q3)];
    expect(startingNow(sourceOf(quests, [Q1, Q2], { registry: {} }), [Q3], [])).toEqual({
      checks: [],
      scripts: [],
    });
    const { background: _none, ...sandbox } = sourceOf(quests, []);
    expect(startingNow(sandbox, [Q1, Q2, Q3], [Q4])).toEqual({ checks: [Q1, Q2, Q3], scripts: [Q4] });
  });

  it('counts a quest it does not know, or a script, as no trial', () => {
    const quests = [trial(Q1), trial(Q2)];
    expect(startingNow(sourceOf(quests, [Q1, Q2]), [Q5], [])).toEqual({ checks: [Q5], scripts: [] });
  });
});
