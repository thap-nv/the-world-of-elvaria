// PS-12b: the three lesson tables of `elvaria metrics` and of the report: what each line did, how each kind of failure
// moves, which failures repeat. The tables are built here from rows made by hand; view-lessons-command.spec.ts runs
// the command over a kingdom on disk.
import { metricsOf } from '@elvaria/domain';
import type { LessonRow, Metrics, RepeatedFailure } from '@elvaria/domain';
import { translator } from '@elvaria/i18n';
import { describe, expect, it } from 'vitest';

import { OTHER_QUEST_ID, QUEST_ID } from '../__fixtures__/quest.ts';
import { failKindsSection, lessonsSection, repeatsSection } from './view-lessons.ts';
import { metricsSections } from './view.ts';

const t = translator('en');
const EMPTY = metricsOf({ quests: [], verdicts: [], events: [], commands: [] });
const REF = 'L_20261106_4k2pqz';
const SENTENCE = 'Keep the README in step with the code.';

const row = (over: Record<string, unknown> = {}): LessonRow =>
  ({
    ref: REF,
    fail_kind: 'style',
    loads: 3,
    helped: 2,
    missed: 1,
    first_at: '2026-11-06T08:00:00+07:00',
    last_at: '2026-11-09T09:30:00+07:00',
    effect: null,
    ...over,
  }) as unknown as LessonRow;

const withRows = (lessons: readonly LessonRow[]): Metrics => ({ ...EMPTY, lessons });

describe('the lessons table (PS-12b)', () => {
  it('says what it is waiting for when no prompt has named a line', () => {
    expect(lessonsSection(t, EMPTY, new Map()).lines).toEqual([
      'No session has written a per-line load trace yet (load_trace.lessons, since PS-12), so there is no lesson to count.',
    ]);
  });

  it('prints the counts of a line, the days it was first and last loaded, and its sentence', () => {
    const section = lessonsSection(t, withRows([row()]), new Map([[REF, SENTENCE]]));
    expect(section.table?.header).toEqual([
      'Ref',
      'Fail kind',
      'Loads',
      'Helped',
      'Missed',
      'Effect',
      'First load',
      'Last load',
      'Text',
    ]);
    expect(section.table?.rows).toEqual([
      [REF, 'style', '3', '2', '1', '—', '2026-11-06', '2026-11-09', SENTENCE],
    ]);
  });

  it('cuts a long sentence at 60 characters, and has none for a line the files no longer hold', () => {
    const long = 'x'.repeat(100);
    const rows = lessonsSection(
      t,
      withRows([row(), row({ ref: 'L_20261106_9p5q4c', fail_kind: null })]),
      new Map([[REF, long]]),
    ).table?.rows;
    expect(rows?.[0]?.[8]).toBe(`${'x'.repeat(59)}…`);
    expect(rows?.[1]?.[1]).toBe('—');
    expect(rows?.[1]?.[8]).toBe('—');
  });

  it('says in words what the effect is: too early, no baseline, or the change in points', () => {
    const effect = (over: Partial<NonNullable<LessonRow['effect']>>) =>
      lessonsSection(
        t,
        withRows([
          row({
            effect: {
              result: 'measured',
              before: { runs: 10, failed: 4 },
              with: { runs: 20, failed: 2 },
              points: -30,
              ...over,
            },
          }),
        ]),
        new Map(),
      ).table?.rows[0]?.[5];
    expect(effect({})).toBe('4/10 → 2/20 (-30 points)');
    expect(effect({ points: 15 })).toBe('4/10 → 2/20 (+15 points)');
    expect(effect({ points: 0 })).toBe('4/10 → 2/20 (0 points)');
    expect(effect({ result: 'too_early', points: null, with: { runs: 7, failed: 1 } })).toBe(
      'too early (7/20 runs)',
    );
    expect(effect({ result: 'no_baseline', points: null })).toBe('no run before this line');
  });
});

describe('the fail kinds table (PS-12b)', () => {
  it('prints each kind with its failures per bucket, oldest first', () => {
    const metrics: Metrics = {
      ...EMPTY,
      fail_kinds: [
        {
          fail_kind: 'style',
          failed: 3,
          buckets: [
            { from: '2026-11-01T07:00:00+07:00', to: '2026-11-20T07:00:00+07:00', runs: 20, failed: 2 },
            { from: '2026-11-21T07:00:00+07:00', to: '2026-11-25T07:00:00+07:00', runs: 5, failed: 1 },
          ],
        },
      ],
    };
    const section = failKindsSection(t, metrics);
    expect(section.title).toBe('Fail kinds over time (failed runs of judged runs, per bucket of 20)');
    expect(section.table?.header).toEqual(['Fail kind', 'Failed runs', 'Per 20 judged runs (old → new)']);
    expect(section.table?.rows).toEqual([['style', '3', '2/20 · 1/5']]);
  });

  it('says so when no run failed or none was judged', () => {
    expect(failKindsSection(t, EMPTY).lines).toEqual(['No run has been judged yet, or none failed.']);
  });
});

describe('the repeated failures table (PS-12b)', () => {
  const member = (quest: string, over: Record<string, unknown> = {}) =>
    ({
      verdict: `${quest}-1`,
      quest,
      n: 1,
      class: 'knight',
      tribe: 'claude',
      model: 'sonnet-x',
      territory: 'do-an',
      tags: ['docs'],
      lessons: [],
      ...over,
    }) as unknown as RepeatedFailure['members'][number];

  it('prints each group with who worked it and where, each value once, and the lessons its prompts carried', () => {
    const group: RepeatedFailure = {
      fail_kind: 'style',
      members: [
        member(QUEST_ID, { lessons: [REF] }),
        member(OTHER_QUEST_ID, { tribe: 'codex', model: null, class: null, tags: ['docs', 'infra'] }),
        member('q_20261106_9p5q4c', { lessons: [REF] }),
      ],
    };
    const section = repeatsSection(t, { ...EMPTY, repeats: [group] });
    expect(section.title).toBe(
      'Repeated failures among the last 50 judged runs (from 3 verdicts of one kind)',
    );
    expect(section.table?.rows).toEqual([
      [
        'style',
        '3',
        `${QUEST_ID}-1, ${OTHER_QUEST_ID}-1, q_20261106_9p5q4c-1`,
        'knight, —',
        'claude, codex',
        'sonnet-x, —',
        'do-an',
        'docs, infra',
        REF,
      ],
    ]);
  });

  it('says what makes a failure repeat when none does', () => {
    expect(repeatsSection(t, EMPTY).lines).toEqual([
      'No failure repeats: no kind has 3 verdicts among the last 50 judged runs.',
    ]);
  });
});

describe('the lessons tables in the ledger (PS-12b)', () => {
  it('puts the tables before the reminder table, and the limits say what they count', () => {
    const titles = metricsSections(t, EMPTY).map(({ title }) => title);
    expect(titles.slice(-6, -3)).toEqual([
      'Lessons in the scriptures: loads, helped, missed and effect',
      'Fail kinds over time (failed runs of judged runs, per bucket of 20)',
      'Repeated failures among the last 50 judged runs (from 3 verdicts of one kind)',
    ]);
    const limits = metricsSections(t, EMPTY).at(-1)?.lines.join('\n') ?? '';
    expect(limits).toContain('The lessons table counts per run of the assignee');
  });
});
