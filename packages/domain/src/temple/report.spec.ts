import { describe, expect, it } from 'vitest';

import { lessonIdOf, templeLessonKeyOf, templeReportIssues } from './report.ts';
import { COMMAND, addOf, fileOf, mergeOf, monkFileOf, monkId, retireOf } from './__fixtures__/report.ts';

describe('templeReportIssues (DB7)', () => {
  const six = monkFileOf('temple', 6);
  const two = monkFileOf('thorn', 2, 11);

  it('lets a report of three new lines and a merge of two through', () => {
    const operations = [addOf(), addOf(), mergeOf([monkId(1), monkId(2)])];
    expect(templeReportIssues(operations, [six, two])).toEqual({ ok: true, value: null });
  });

  it('refuses a report of four new lines, a merge counted as one', () => {
    const operations = [addOf(), addOf(), addOf(), mergeOf([monkId(1), monkId(2)])];
    expect(templeReportIssues(operations, [six])).toEqual({
      ok: false,
      error: { code: 'replaces_scripture', rule: 'adds' },
    });
  });

  it('refuses taking every line of a file out and putting them back', () => {
    const operations = [...[1, 2, 3, 4, 5, 6].map((n) => retireOf(monkId(n))), addOf(), addOf(), addOf()];
    expect(templeReportIssues(operations, [six])).toEqual({
      ok: false,
      error: { code: 'replaces_scripture', rule: 'removals', owner: 'temple' },
    });
  });

  it("allows half of the Monk's lines of a file, and one more is too many", () => {
    const half = [1, 2, 3].map((n) => retireOf(monkId(n)));
    expect(templeReportIssues(half, [six]).ok).toBe(true);
    expect(templeReportIssues([...half, retireOf(monkId(4))], [six]).ok).toBe(false);
  });

  it('always allows two from a file of few, counting an id named twice once', () => {
    const operations = [mergeOf([monkId(11), monkId(12)]), retireOf(monkId(11))];
    expect(templeReportIssues(operations, [six, two]).ok).toBe(true);
    const three = [mergeOf([monkId(11), monkId(12)]), retireOf(monkId(1)), retireOf(monkId(2))];
    expect(templeReportIssues(three, [six, two]).ok).toBe(true);
  });

  it("counts no line the Monk does not hold: the owner's and the unknown are refused one by one", () => {
    const owner = fileOf('vale', ['- Owner rule.', `- [${monkId(30)}] Owner copied an id.`]);
    const operations = [retireOf(monkId(30)), retireOf(monkId(31)), retireOf(monkId(32))];
    expect(templeReportIssues(operations, [owner]).ok).toBe(true);
  });
});

describe('the id of a new line', () => {
  it('is made of the report and the place of the operation, on the day of the report', () => {
    expect(templeLessonKeyOf(COMMAND, 2)).toBe(`${COMMAND}\ntemple_report\n2`);
    expect(lessonIdOf('2026-11-19T23:59:00+07:00', new Uint8Array(8))).toBe('L_20261119_000000');
  });
});
