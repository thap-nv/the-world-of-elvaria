// The scratch-plot helpers on their own (ADR 0022, P1-20), over a stub of the tick's context: the paths a whole
// Steward rarely takes (a plot a program holds, git that fails, a flake the kingdom cannot open a quest for).
import { FLAKE_CHECK_ID, FLAKE_RUNS } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { childIdOf } from '../deliver/subquests.ts';
import { createJudgeLocks } from './exclusive.ts';
import { openFlakyFollowUp, releaseScratch, trialOf } from './scratch.ts';
import type { Context } from '../context.ts';
import type { Quest, QuestId, Ritual, Territory, Verdict } from '@elvaria/domain';

const QUEST = 'q_20261109_7k3m2a' as QuestId;
const quest = {
  id: QUEST,
  title: 'E2E for checkout',
  kind: 'build',
  rank: 'D',
  territory: 'dc1-se-team',
  tags: ['e2e'],
  plot: { type: 'worktree', path: 'D:/repo/.elvaria/worktrees/q', branch: 'quest/q' },
  updated_at: '2026-11-09T10:00:00+07:00',
} as unknown as Quest;
const territory = { id: 'dc1-se-team' } as unknown as Territory;
const MUTATION = {
  id: 'mutation_check',
  steps: ['rerun_clean', 'flake_check', 'judge'],
  scratch_plot: true,
  flaky_follow_up: { kind: 'fix', class: 'knight' },
} as unknown as Ritual;
const flaky = {
  attempt: 1,
  result: 'fail',
  fail_kind: 'flaky',
  checks: [{ id: FLAKE_CHECK_ID, pass: false, duration_ms: 1, log_path: 'x' }],
  notes: '✗ flake_check: x',
} as unknown as Verdict;

interface StubWorld {
  release?: () => Promise<string | undefined>;
  rituals?: readonly Ritual[];
  put?: { ok: boolean; error?: string };
  quests?: readonly Quest[];
}

function stub(world: StubWorld = {}) {
  const warnings: string[] = [];
  const quests = new Map([[QUEST, quest], ...(world.quests ?? []).map((q) => [q.id, q] as const)]);
  const log = { warn: (message: string) => void warnings.push(message) };
  const ctx = {
    judgeLocks: createJudgeLocks(log),
    world: {
      quests,
      territories: new Map([[territory.id, territory]]),
      registry: {
        kinds: [
          {
            id: 'build',
            ritual: 'build_review',
            ritual_overrides: [{ tags_any: ['e2e'], ritual: 'mutation_check' }],
          },
          { id: 'fix', name_vi: 'Trừ tà', name_en: 'Fix', classes_allowed: [] },
        ],
        rituals: world.rituals ?? [MUTATION],
        classes: [],
        tags: [],
      },
      kingdom: { tz: 'Asia/Ho_Chi_Minh', owner: { locale: 'en' }, breakers: {} },
    },
    deps: {
      log,
      plots: { releaseScratch: world.release ?? (() => Promise.resolve(undefined)) },
      ids: { quest: () => 'q_20261109_000000' },
    },
    record: {
      stamp: () => '2026-11-09T10:00:00+07:00',
      put: () => Promise.resolve(world.put ?? { ok: true }),
    },
  } as unknown as Context;
  return { ctx, warnings };
}

describe('the trial a ritual asks for', () => {
  it('runs three times under flake_check, once otherwise, and measures coverage only when asked', () => {
    expect(trialOf(MUTATION)).toEqual({ runs: FLAKE_RUNS, coverage: false });
    expect(trialOf({ ...MUTATION, steps: ['coverage_not_lower'] })).toEqual({ runs: 1, coverage: true });
    expect(trialOf(undefined)).toEqual({ runs: 1, coverage: false });
  });
});

describe('releaseScratch', () => {
  it('says when a program still holds the scratch plot, or git could not remove it', async () => {
    const held = stub({ release: () => Promise.resolve('D:/repo/q-verify: EBUSY') });
    await releaseScratch(held.ctx, QUEST);
    const broken = stub({ release: () => Promise.reject(new Error('git is not found')) });
    await releaseScratch(broken.ctx, QUEST);
    expect([...held.warnings, ...broken.warnings]).toEqual([
      `steward: ${QUEST}: the scratch plot stays: D:/repo/q-verify: EBUSY`,
      `steward: ${QUEST}: the scratch plot was not removed: git is not found`,
    ]);
  });

  it('leaves alone a quest it does not know, or one judged without a scratch plot', async () => {
    let calls = 0;
    const count = () => Promise.resolve(void (calls += 1));
    await releaseScratch(stub({ release: count }).ctx, 'q_20261109_gone00' as QuestId);
    await releaseScratch(
      stub({ release: count, rituals: [{ ...MUTATION, scratch_plot: false }] }).ctx,
      QUEST,
    );
    expect(calls).toBe(0);
  });
});

describe('openFlakyFollowUp', () => {
  it('opens nothing without a ritual, and finds the quest it opened before', async () => {
    expect(await openFlakyFollowUp(stub({ rituals: [] }).ctx, quest, flaky)).toBeUndefined();
    expect(await openFlakyFollowUp(stub().ctx, quest, { ...flaky, result: 'pass' })).toBeUndefined();
    // A verdict judged again after a restart: the quest of run 1 is there already (its id derives from the run).
    const id = childIdOf(stub().ctx, quest, 'flaky-1');
    const again = stub({ quests: [{ ...quest, id }] });
    expect(await openFlakyFollowUp(again.ctx, quest, flaky)).toBe(id);
  });

  it('says why when the kingdom refuses the quest', async () => {
    // The stub's registry has no class the fix kind allows; the whole Steward's path is in trial.spec.ts.
    const refused = stub();
    expect(await openFlakyFollowUp(refused.ctx, quest, flaky)).toBeUndefined();
    expect(refused.warnings[0]).toMatch(`steward: ${QUEST}: no quest for its flaky checks: `);
  });
});
