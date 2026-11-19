import { describe, expect, it } from 'vitest';

import { failure, line, source, verdictId } from './__fixtures__/evidence.ts';
import {
  cutNotes,
  evidenceCeilingOf,
  evidenceIsEmpty,
  evidenceSizeOf,
  templeEvidenceOf,
} from './evidence.ts';
import type { LessonCount } from '../metrics/lesson-counts.ts';

const count = (ref: string, loads: number, helped: number, missed: number): LessonCount =>
  ({
    ref,
    fail_kind: 'tests_fail',
    loads,
    helped,
    missed,
    first_at: 'a',
    last_at: 'b',
  }) as unknown as LessonCount;

describe('templeEvidenceOf (PS-12d)', () => {
  it("carries each group with its verdicts' notes, cut at 600 characters", () => {
    const long = 'x'.repeat(700);
    const notes = new Map([
      [verdictId(1), 'short note'],
      [verdictId(2), long],
    ]);
    const pack = templeEvidenceOf(source({ failures: [failure('tests_fail', 3, 1)], notes }));
    const [group] = pack.groups;
    expect(group?.group).toBe('tests_fail');
    expect(group?.members.map(({ notes: text }) => text.length)).toEqual([10, 600, 0]);
    expect(group?.members[1]?.notes.endsWith('…')).toBe(true);
  });

  it('joins the counts to the lines and names the Monk lines worth a review', () => {
    const lines = [
      line({ ref: 'L_20261119_aaaaaa' }),
      line({ ref: 'L_20261119_bbbbbb' }),
      line({ ref: 'L_20261119_cccccc', source: 'user' }),
      line({ ref: 'L_20261119_dddddd' }),
      line({ ref: 'L_20261119_eeeeee' }),
    ];
    const counts = [
      count('L_20261119_aaaaaa', 20, 10, 10),
      count('L_20261119_bbbbbb', 20, 11, 9),
      count('L_20261119_cccccc', 30, 0, 30),
      count('L_20261119_dddddd', 19, 0, 19),
    ];
    const pack = templeEvidenceOf(source({ lines, counts }));
    expect(pack.reviews).toEqual(['L_20261119_aaaaaa']);
    expect(pack.lines.map(({ loads, helped, missed }) => [loads, helped, missed])).toEqual([
      [20, 10, 10],
      [20, 11, 9],
      [30, 0, 30],
      [19, 0, 19],
      [0, 0, 0],
    ]);
  });

  it("cuts at the tribe's ceiling, keeping the group that repeats most and naming the ones dropped", () => {
    const failures = [failure('incomplete', 8, 1), failure('wrong_facts', 5, 20), failure('style', 3, 40)];
    const notes = new Map(Array.from({ length: 50 }, (_, index) => [verdictId(index + 1), 'n'.repeat(500)]));
    const whole = templeEvidenceOf(source({ failures, notes }));
    expect(whole.groups.map(({ group }) => group)).toEqual(['incomplete', 'wrong_facts', 'style']);
    expect(evidenceSizeOf(whole)).toBeGreaterThan(9000);

    const cut = templeEvidenceOf(source({ failures, notes, prompt_max: 9000 }));
    expect(cut.groups.map(({ group }) => group)).toEqual(['incomplete']);
    expect(cut.dropped).toEqual(['wrong_facts', 'style']);
    expect(evidenceSizeOf(cut)).toBeLessThanOrEqual(9000);

    const none = templeEvidenceOf(source({ failures, notes, prompt_max: 500 }));
    expect(none.groups).toEqual([]);
    expect(none.dropped).toEqual(['incomplete', 'wrong_facts', 'style']);
  });

  it('never goes over 24 000 characters, whatever the tribe takes', () => {
    expect(evidenceCeilingOf(undefined)).toBe(24_000);
    expect(evidenceCeilingOf(100_000)).toBe(24_000);
    expect(evidenceCeilingOf(26_000)).toBe(24_000);
    expect(evidenceCeilingOf(9000)).toBe(9000);
  });

  it('is empty, so no model runs, with no group and no line to review', () => {
    expect(evidenceIsEmpty(templeEvidenceOf(source({ lines: [line()] })))).toBe(true);
    expect(evidenceIsEmpty(templeEvidenceOf(source({ failures: [failure('style', 3, 1)] })))).toBe(false);
    const review = source({ lines: [line()], counts: [count('L_20261119_aaaaaa', 25, 5, 20)] });
    expect(evidenceIsEmpty(templeEvidenceOf(review))).toBe(false);
  });

  it('leaves notes up to 600 characters whole', () => {
    expect(cutNotes('y'.repeat(600))).toBe('y'.repeat(600));
    expect(cutNotes('y'.repeat(601))).toBe(`${'y'.repeat(599)}…`);
  });
});
