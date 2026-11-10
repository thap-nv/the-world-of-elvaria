import { describe, expect, it } from 'vitest';

import { Q1 } from '../dispatch/__fixtures__/snapshot.ts';
import { NOTES, reviewed, verdictOf } from './__fixtures__/verdicts.ts';
import { BREAK_STEP, breaksDue, passWithoutNotes, withBreaksWeighed } from './evidence.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Verdict } from '../schema/quest/verdict.ts';
import type { Registry } from '../schema/registry.ts';
import type { Kind, Ritual } from '../schema/registry-entries.ts';

const ritual = (id: string, steps: readonly string[], scratch?: boolean) =>
  ({ id, steps, ...(scratch === undefined ? {} : { scratch_plot: scratch }) }) as unknown as Ritual;
const kind = (id: string, own: string) => ({ id, ritual: own }) as unknown as Kind;

/** build is judged by mutation_check (scratch, breaks), fix by rerun (scratch, no break), docs by a plain review. */
const REGISTRY: Pick<Registry, 'kinds' | 'rituals'> = {
  kinds: [kind('build', 'mutation_check'), kind('fix', 'rerun'), kind('docs', 'build_review')],
  rituals: [
    ritual('mutation_check', ['rerun_clean', BREAK_STEP, 'judge', 'write_verdict'], true),
    ritual('rerun', ['rerun_clean', 'judge', 'write_verdict'], true),
    ritual('build_review', ['run_checks', BREAK_STEP, 'judge']),
  ],
};

const WORKTREE = { type: 'worktree', path: 'D:/r/.elvaria/worktrees/q', branch: `quest/${Q1}` } as const;
const judgedQuest = (kindId: string, plot: Quest['plot'] = WORKTREE): Quest => ({
  ...reviewed,
  kind: kindId as Quest['kind'],
  plot,
});
const BREAKS = [
  { change: 'src/api/orders.ts:42 drops the discount', red: 'pnpm test orders: 2 failed' },
  { change: 'src/api/orders.ts:57 returns 0', red: 'pnpm test orders: 1 failed' },
];

describe('passWithoutNotes', () => {
  it('is a pass whose notes are missing or blank', () => {
    expect(passWithoutNotes({ result: 'pass' })).toBe(true);
    expect(passWithoutNotes({ result: 'pass', notes: ' \n' })).toBe(true);
  });

  it('is not a pass that says what was checked, nor a fail or a partial', () => {
    expect(passWithoutNotes({ result: 'pass', notes: NOTES })).toBe(false);
    expect(passWithoutNotes({ result: 'partial' })).toBe(false);
    expect(passWithoutNotes({ result: 'fail' })).toBe(false);
  });
});

describe('breaksDue', () => {
  it('asks for breaks of a judge in a scratch plot whose ritual breaks code', () => {
    expect(breaksDue(judgedQuest('build'), REGISTRY)).toBe(true);
  });

  it('asks for none without the step, without a scratch plot, on a folder, or without a ritual', () => {
    expect(breaksDue(judgedQuest('fix'), REGISTRY)).toBe(false);
    expect(breaksDue(judgedQuest('docs'), REGISTRY)).toBe(false);
    expect(breaksDue(judgedQuest('build', { type: 'folder', path: 'quests/q/work' }), REGISTRY)).toBe(false);
    expect(breaksDue(judgedQuest('build'), { ...REGISTRY, rituals: [] })).toBe(false);
  });
});

describe('withBreaksWeighed', () => {
  const pass = verdictOf({ notes: NOTES });

  it('takes a pass in the scratch plot with fewer than two breaks as the partial of this session', () => {
    for (const breaks of [undefined, BREAKS.slice(0, 1)]) {
      const verdict = verdictOf({ notes: NOTES, ...(breaks === undefined ? {} : { breaks }) });
      expect(withBreaksWeighed(verdict, judgedQuest('build'), REGISTRY)).toEqual({
        ...verdict,
        id: `${Q1}-1-p1`,
        result: 'partial',
        progress: { checked_until: BREAK_STEP },
      });
    }
  });

  it('keeps a pass with its breaks, and a pass that owes none', () => {
    const shown = verdictOf({ notes: NOTES, breaks: BREAKS });
    expect(withBreaksWeighed(shown, judgedQuest('build'), REGISTRY)).toBe(shown);
    expect(withBreaksWeighed(pass, judgedQuest('fix'), REGISTRY)).toBe(pass);
  });

  it('keeps a fail and a partial, which say why on their own', () => {
    const fail = verdictOf({ result: 'fail', fail_kind: 'incomplete', notes: NOTES });
    const partial = verdictOf({
      id: `${Q1}-1-p1` as Verdict['id'],
      result: 'partial',
      progress: { checked_until: 'judge' },
    });
    expect(withBreaksWeighed(fail, judgedQuest('build'), REGISTRY)).toBe(fail);
    expect(withBreaksWeighed(partial, judgedQuest('build'), REGISTRY)).toBe(partial);
  });
});
