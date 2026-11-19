import { describe, expect, it } from 'vitest';

import { evidenceJudgement, evidenceRun, ref, runsOf } from './__fixtures__/lessons.ts';
import type { LooseOf } from './__fixtures__/lessons.ts';
import { lessonEffectOf, lessonRowsOf } from './lesson-effect.ts';
import type { LessonFact } from './ledger.ts';
import type { EvidenceRun } from './lesson-runs.ts';
import type { LessonScope } from '../schema/lesson/scope.ts';

const A = ref('aaaaaa');
const FAIL_STYLE: LooseOf<EvidenceRun> = { result: 'fail', fail_kind: 'style' };
const PASS: LooseOf<EvidenceRun> = { result: 'pass' };

const scopeOf = (scope: Record<string, readonly string[]>): LessonScope => scope;

const factOf = (scope: LessonScope = {}, kind: LessonFact['fail_kind'] = 'style'): LessonFact => ({
  ref: A as LessonFact['ref'],
  fail_kind: kind,
  scope,
});

/** Ten runs before the line (four failed with `style`), then `after` runs that carried it (two failed). */
function history(after: number, before = 10): readonly EvidenceRun[] {
  return [
    ...runsOf(before, (index) => (index < 4 ? FAIL_STYLE : PASS)),
    ...runsOf(after, (index) => ({ lessons: [A], ...(index - before < 2 ? FAIL_STYLE : PASS) }), before),
  ];
}

describe('lessonEffectOf (PS-12b)', () => {
  it('says too_early at 19 runs that carried the line, and gives a number at 20', () => {
    expect(lessonEffectOf({ runs: history(19), judgements: [] }, factOf())).toEqual({
      result: 'too_early',
      before: { runs: 10, failed: 4 },
      with: { runs: 19, failed: 2 },
      points: null,
    });
    // 2 of 20 (10 %) against 4 of 10 (40 %): the style failures fell by 30 points.
    expect(lessonEffectOf({ runs: history(20), judgements: [] }, factOf())).toEqual({
      result: 'measured',
      before: { runs: 10, failed: 4 },
      with: { runs: 20, failed: 2 },
      points: -30,
    });
  });

  it('gives a positive number when the kind failed more after the line', () => {
    const runs = [
      ...runsOf(10, () => PASS),
      ...runsOf(20, (index) => ({ lessons: [A], ...(index % 2 === 0 ? FAIL_STYLE : PASS) }), 10),
    ];
    expect(lessonEffectOf({ runs, judgements: [] }, factOf())).toMatchObject({
      result: 'measured',
      points: 50,
    });
  });

  it('has no baseline when no run in scope came before the line', () => {
    const runs = runsOf(20, () => ({ lessons: [A], ...PASS }));
    expect(lessonEffectOf({ runs, judgements: [] }, factOf())).toEqual({
      result: 'no_baseline',
      before: { runs: 0, failed: 0 },
      with: { runs: 20, failed: 0 },
      points: null,
    });
  });

  it('counts only the runs that were decided, and only a failure of the line’s kind', () => {
    const runs = [
      ...runsOf(3, () => ({ result: 'fail', fail_kind: 'unsafe' })),
      ...runsOf(3, () => ({})),
      ...runsOf(2, () => FAIL_STYLE),
      ...runsOf(1, () => ({ lessons: [A], result: 'fail', fail_kind: 'style' }), 8),
      ...runsOf(1, () => ({ lessons: [A] }), 9),
    ];
    expect(lessonEffectOf({ runs, judgements: [] }, factOf())).toMatchObject({
      result: 'too_early',
      before: { runs: 5, failed: 2 },
      with: { runs: 1, failed: 1 },
    });
  });

  describe('the runs in the line’s scope', () => {
    const before = (extra: LooseOf<EvidenceRun>): readonly EvidenceRun[] => [
      ...runsOf(3, () => ({ ...PASS, ...extra })),
      ...runsOf(1, () => ({ lessons: [A], ...PASS }), 3),
    ];
    const baselineRuns = (scope: LessonScope, extra: LooseOf<EvidenceRun>): number | undefined =>
      lessonEffectOf({ runs: before(extra), judgements: [] }, factOf(scope))?.before.runs;

    it('are those that match every key: tribe, class, territory and tag', () => {
      expect(baselineRuns(scopeOf({ tribe: ['claude'] }), {})).toBe(3);
      expect(baselineRuns(scopeOf({ tribe: ['codex'] }), {})).toBe(0);
      expect(baselineRuns(scopeOf({ class: ['sage'] }), {})).toBe(0);
      expect(baselineRuns(scopeOf({ class: ['knight'] }), {})).toBe(3);
      expect(baselineRuns(scopeOf({ territory: ['elvaria'] }), { territory: 'elvaria' })).toBe(3);
      expect(baselineRuns(scopeOf({ territory: ['elvaria'] }), {})).toBe(0);
      expect(baselineRuns(scopeOf({ tag: ['docs', 'infra'] }), {})).toBe(3);
      expect(baselineRuns(scopeOf({ tag: ['docs'] }), {})).toBe(0);
    });

    it('know no OS: a key for it filters nothing, since the ledger does not record where a run ran', () => {
      expect(baselineRuns(scopeOf({ os: ['win32'] }), {})).toBe(3);
    });

    it('leave out a run whose class or tribe the ledger does not know when the scope names one', () => {
      expect(baselineRuns(scopeOf({ tribe: ['claude'] }), { tribe: null })).toBe(0);
      expect(baselineRuns(scopeOf({ class: ['knight'] }), { class: null })).toBe(0);
      expect(baselineRuns({}, { tribe: null, class: null })).toBe(3);
    });
  });

  it('measures a line for both roles and a line for assignees, not one only a judge reads', () => {
    const both = factOf(scopeOf({ role: ['assignee', 'verifier'] }));
    expect(lessonEffectOf({ runs: history(20), judgements: [] }, both)).toMatchObject({ points: -30 });
    expect(
      lessonEffectOf({ runs: history(20), judgements: [] }, factOf(scopeOf({ role: ['assignee'] }))),
    ).not.toBeNull();
    expect(
      lessonEffectOf({ runs: history(20), judgements: [] }, factOf(scopeOf({ role: ['verifier'] }))),
    ).toBeNull();
  });

  it('measures nothing for a line with no kind, and nothing for a line no run carried', () => {
    expect(lessonEffectOf({ runs: history(20), judgements: [] }, factOf({}, null))).toBeNull();
    expect(lessonEffectOf({ runs: runsOf(5, () => PASS), judgements: [] }, factOf())).toBeNull();
  });
});

describe('lessonRowsOf (PS-12b)', () => {
  it('puts the effect beside the counts of each line, null for a line the files do not know', () => {
    const runs = [...history(20), evidenceRun({ lessons: [ref('zzzzzz')], result: 'pass' })];
    const rows = lessonRowsOf({ runs, judgements: [evidenceJudgement({ lessons: [A], stood: true })] }, [
      factOf(),
    ]);
    expect(
      rows.map(({ ref: lesson, loads, helped, missed, effect }) => [
        lesson,
        loads,
        helped,
        missed,
        effect?.points,
      ]),
    ).toEqual([
      // 20 runs carried A, and a judge session; two failed with its kind.
      [A, 21, 19, 2, -30],
      [ref('zzzzzz'), 1, 0, 0, undefined],
    ]);
  });
});
