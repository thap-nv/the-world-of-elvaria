// The ledger's three tables about lessons (PS-12b, temple-first plan): what each line of the scriptures did, how each
// kind of failure moves over the judged runs, and which failures repeat. Apart from view.ts, which is near its limit.
// The sentence of a line is joined here from the scriptures the reader parsed: the ledger holds refs only, so the
// printed table, not `--json`, carries text, and a line the owner has since deleted shows no sentence.
import { FAIL_RATE_BUCKET_RUNS, TEMPLE_REPEAT_MIN, TEMPLE_WINDOW_RUNS, dayOf } from '@elvaria/domain';
import type { LessonEffect, LessonRow, Metrics, RepeatedFailure } from '@elvaria/domain';
import type { Translate } from '@elvaria/i18n';

import { NONE } from '../listing.ts';
import { count, tableSection } from './section.ts';
import type { MetricsSection } from './section.ts';

/** The sentence is the longest cell of the table: the first words say which line it is, the ref says exactly. */
const SENTENCE_SHOWN = 60;
const ELLIPSIS = '…';

const sentenceCell = (sentence: string | undefined): string => {
  if (sentence === undefined) return NONE;
  return sentence.length <= SENTENCE_SHOWN ? sentence : `${sentence.slice(0, SENTENCE_SHOWN - 1)}${ELLIPSIS}`;
};

function effectCell(t: Translate, effect: LessonEffect | null): string {
  if (effect === null) return NONE;
  if (effect.result === 'too_early')
    return t('cli.metrics.effect.too_early', { runs: effect.with.runs, need: FAIL_RATE_BUCKET_RUNS });
  if (effect.result === 'no_baseline') return t('cli.metrics.effect.no_baseline');
  const points = effect.points ?? 0;
  return t('cli.metrics.effect.measured', {
    before_failed: effect.before.failed,
    before_runs: effect.before.runs,
    with_failed: effect.with.failed,
    with_runs: effect.with.runs,
    points: points > 0 ? `+${points}` : String(points),
  });
}

const LESSON_COLUMNS = [
  'cli.column.ref',
  'cli.column.fail_kind',
  'cli.metrics.column.loads',
  'cli.metrics.column.helped',
  'cli.metrics.column.missed',
  'cli.metrics.column.effect',
  'cli.metrics.column.first_load',
  'cli.metrics.column.last_load',
  'cli.column.text',
] as const;

const lessonRow = (t: Translate, row: LessonRow, sentences: ReadonlyMap<string, string>): string[] => [
  row.ref,
  row.fail_kind ?? NONE,
  count(row.loads),
  count(row.helped),
  count(row.missed),
  effectCell(t, row.effect),
  dayOf(row.first_at),
  dayOf(row.last_at),
  sentenceCell(sentences.get(row.ref)),
];

/** `helped` and `missed` of each line, and its effect on the kind of failure it cures. */
export const lessonsSection = (
  t: Translate,
  metrics: Metrics,
  sentences: ReadonlyMap<string, string>,
): MetricsSection =>
  tableSection(t('cli.metrics.title.lessons'), t('cli.metrics.lessons.none'), {
    header: LESSON_COLUMNS.map((column) => t(column)),
    rows: metrics.lessons.map((row) => lessonRow(t, row, sentences)),
  });

const BUCKET_SEPARATOR = ' · ';

/** Each kind that failed a run, with its failures over the buckets of judged runs, oldest first. */
export const failKindsSection = (t: Translate, metrics: Metrics): MetricsSection =>
  tableSection(
    t('cli.metrics.title.fail_kinds', { size: FAIL_RATE_BUCKET_RUNS }),
    t('cli.metrics.fail_kinds.none'),
    {
      header: [
        t('cli.column.fail_kind'),
        t('cli.metrics.column.failed'),
        t('cli.metrics.column.by_bucket', { size: FAIL_RATE_BUCKET_RUNS }),
      ],
      rows: metrics.fail_kinds.map(({ fail_kind, failed, buckets }) => [
        fail_kind,
        count(failed),
        buckets.map((bucket) => `${bucket.failed}/${bucket.runs}`).join(BUCKET_SEPARATOR),
      ]),
    },
  );

const distinct = (values: readonly (string | null)[]): string =>
  [...new Set(values.map((value) => value ?? NONE))].join(', ');

function repeatRow(group: RepeatedFailure): string[] {
  const { members } = group;
  return [
    group.fail_kind,
    count(members.length),
    members.map(({ verdict }) => verdict).join(', '),
    distinct(members.map(({ class: kind }) => kind)),
    distinct(members.map(({ tribe }) => tribe)),
    distinct(members.map(({ model }) => model)),
    distinct(members.map(({ territory }) => territory)),
    distinct(members.flatMap(({ tags }) => tags)),
    distinct(members.flatMap(({ lessons }) => lessons)),
  ];
}

const REPEAT_COLUMNS = [
  'cli.column.fail_kind',
  'cli.metrics.column.count',
  'cli.metrics.column.verdicts',
  'cli.metrics.column.class',
  'cli.metrics.column.tribe',
  'cli.metrics.column.model',
  'cli.metrics.column.territory',
  'cli.metrics.column.tags',
  'cli.metrics.column.lessons',
] as const;

/** The failures the Temple would read: from three verdicts of one kind among the last fifty judged runs. */
export const repeatsSection = (t: Translate, metrics: Metrics): MetricsSection => {
  const window = { window: TEMPLE_WINDOW_RUNS, min: TEMPLE_REPEAT_MIN };
  return tableSection(t('cli.metrics.title.repeats', window), t('cli.metrics.repeats.none', window), {
    header: REPEAT_COLUMNS.map((column) => t(column)),
    rows: metrics.repeats.map(repeatRow),
  });
};
