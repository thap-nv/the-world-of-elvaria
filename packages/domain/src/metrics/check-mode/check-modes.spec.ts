import { describe, expect, it } from 'vitest';

import { metricsOf } from '../metrics-of.ts';
import { FIRST, LOG } from './__fixtures__/log.ts';
import { SECOND, check, move } from './__fixtures__/log.ts';
import { at, lineOf, questOf } from '../__fixtures__/ledger.ts';
import { merged, ran } from '../../patrol/__fixtures__/patrol-log.ts';
import { checkModesOf } from './check-modes.ts';
import { questPeaksOf } from './concurrency.ts';
import { measuredRunsOf } from './runs.ts';
import { distributionOf } from './distribution.ts';

describe('check modes ledger (CM-09a)', () => {
  it('keeps healing slots separate from working and review slots', () => {
    const events = [move(0, 'working'), move(1, 'healing'), move(2, 'healing', SECOND), move(3, 'review')];
    expect(questPeaksOf(events, {})).toEqual([{ territory: 'elvaria', working: 1, review: 0, healing: 2 }]);
  });
  it('reads all four baselines from one log, without counting an error as a completed check run', () => {
    const metrics = metricsOf({ events: LOG, quests: [], verdicts: [], commands: [] }).check_modes;
    expect(metrics.durations).toEqual([
      { mode: 'full', count: 1, median_minutes: 10, p90_minutes: 10 },
      { mode: 'narrow', count: 1, median_minutes: 2, p90_minutes: 2 },
      { mode: 'patrol', count: 2, median_minutes: 1 / 60, p90_minutes: 1 / 60 },
    ]);
    expect(metrics.full_by_day).toEqual([{ day: '2026-11-08', count: 4 }]);
    expect(metrics.merged_cost).toEqual({
      quests: [{ quest: FIRST.id, minutes: 9 }],
      median_minutes: 9,
      total_minutes: 9,
    });
    expect(metrics.base_red).toEqual([
      {
        territory: 'elvaria',
        check: 'test',
        since: '2026-11-08T07:20:00+07:00',
        until: '2026-11-08T07:30:00+07:00',
        minutes: 10,
      },
    ]);
    expect(metrics.submit_to_merge).toEqual({ count: 1, median_minutes: 20, p90_minutes: 20 });
    expect(metrics.peaks).toEqual([{ territory: 'elvaria', working: 2, review: 2, healing: 0 }]);
  });

  it('has no invented samples or minutes for an empty log', () => {
    expect(checkModesOf([], {})).toEqual({
      escapes: [],
      has_attributions: false,
      durations: [
        { mode: 'full', count: 0, median_minutes: null, p90_minutes: null },
        { mode: 'narrow', count: 0, median_minutes: null, p90_minutes: null },
        { mode: 'patrol', count: 0, median_minutes: null, p90_minutes: null },
      ],
      full_by_day: [],
      merged_cost: { quests: [], median_minutes: null, total_minutes: 0 },
      base_red: [],
      submit_to_merge: { count: 0, median_minutes: null, p90_minutes: null },
      peaks: [],
    });
    expect(
      distributionOf([60000, 120000, 180000, 240000, 300000, 360000, 420000, 480000, 540000, 600000]),
    ).toEqual({ count: 10, median_minutes: 5.5, p90_minutes: 9 });
    expect(distributionOf([0])).toEqual({ count: 1, median_minutes: 0, p90_minutes: 0 });
  });

  it('pairs by quest, attempt and queue marker; consumes errors, stops and duplicate ends', () => {
    const events = [
      check('check.start', 0),
      check('check.start', 1, {}, 2),
      check('check.start', 2, { delivery: true }),
      { ...check('check.start', 3), quest: SECOND.id },
      check('check.end', 4, { outcome: 'pass', checks: [] }, 2),
      check('check.end', 5, { delivery: true, outcome: 'fail', checks: [] }),
      { ...check('check.end', 6, { outcome: 'pass', checks: [] }), quest: SECOND.id },
      check('check.end', 7, { outcome: 'pass', checks: [] }),
      check('check.end', 8, { outcome: 'pass', checks: [] }),
      check('check.start', 9),
      check('check.end', 10, { outcome: 'error', checks: [] }),
      check('check.end', 11, { outcome: 'pass', checks: [] }),
      check('check.start', 12),
      check('check.end', 13, { outcome: 'stopped', checks: [] }),
      lineOf('check.start', {}, at(14)),
      lineOf('check.end', { outcome: 'pass', checks: [] }, at(15)),
    ];
    expect(measuredRunsOf(events).map((row) => [row.quest, row.elapsed_ms])).toEqual([
      [FIRST.id, 180000],
      [FIRST.id, 180000],
      [SECOND.id, 180000],
      [FIRST.id, 420000],
    ]);
  });

  it('counts run ends by their day, and all check cost up to each merged quest, even without a start', () => {
    const events = [
      move(0, 'review'),
      move(2, 'review'),
      check('check.start', 3),
      check('check.end', 5, { outcome: 'pass', checks: [{ id: 'test', pass: true, duration_ms: 120000 }] }),
      lineOf('quest.submitted', {}, at(6)),
      lineOf(
        'check.end',
        { outcome: 'pass', checks: [{ id: 'test', pass: true, duration_ms: 60000 }] },
        at(10),
        FIRST.id,
      ),
      check('check.start', 11),
      { ...check('check.end', 12, { outcome: 'pass', checks: [] }), ts: at(0, '2026-11-09') },
      merged(at(1, '2026-11-09'), FIRST.id),
      merged(at(2, '2026-11-09'), FIRST.id),
      merged(at(3, '2026-11-09'), SECOND.id),
      {
        ...check('check.end', 15, {
          outcome: 'pass',
          checks: [{ id: 'test', pass: true, duration_ms: 600000 }],
        }),
        ts: at(4, '2026-11-09'),
      },
      merged(at(5, '2026-11-10'), FIRST.id),
      ran(at(6, '2026-11-10'), []),
    ];
    const data = checkModesOf(events, { since: '2026-11-09', until: '2026-11-09' });
    expect(data.durations[0]).toEqual({ mode: 'full', count: 1, median_minutes: 1429, p90_minutes: 1429 });
    expect(data.full_by_day).toEqual([{ day: '2026-11-09', count: 2 }]);
    expect(data.merged_cost).toEqual({
      quests: [
        { quest: FIRST.id, minutes: 3 },
        { quest: SECOND.id, minutes: 0 },
      ],
      median_minutes: 1.5,
      total_minutes: 3,
    });
    expect(data.submit_to_merge).toEqual({ count: 1, median_minutes: 1441, p90_minutes: 1441 });
  });

  it('keeps red intervals open across missing, failed setup, plot and environment results and the window end', () => {
    const events = [
      ran(at(0, '2026-11-07'), [{ id: 'old', pass: false }]),
      ran(at(10, '2026-11-07'), [{ id: 'old', pass: true }]),
      ran(at(0), [{ id: 'test', pass: false }]),
      ran(at(1), [{ id: 'test', pass: false }]),
      ran(at(2), [{ id: 'test', pass: false, environment: true }]),
      ran(at(3), [{ id: 'test', pass: true }], { territory: 'other' }),
      ran(at(4), [], { setup: { pass: false, log_path: '.runs/setup.log' } }),
      ran(at(5), [], { plot_failure: 'No plot' }),
      ran(at(6), [], { setup: { pass: true, log_path: '.runs/setup.log' } }),
      ran(at(7), []),
      ran(at(8, '2026-11-09'), [{ id: 'test', pass: true }]),
    ];
    const data = checkModesOf(events, { since: '2026-11-08', until: '2026-11-08' });
    expect(data.base_red).toEqual([
      { territory: 'elvaria', check: 'setup', since: at(4), until: at(6), minutes: 2 },
      { territory: 'elvaria', check: 'test', since: at(0), until: null, minutes: null },
    ]);
    expect(data.durations[2]).toEqual({
      mode: 'patrol',
      count: 8,
      median_minutes: 1 / 60,
      p90_minutes: 1 / 60,
    });
    expect(checkModesOf(events, { since: '2026-11-09' }).base_red).toEqual([
      { territory: 'elvaria', check: 'test', since: at(0), until: at(8, '2026-11-09'), minutes: 1448 },
    ]);
  });

  it('replays occupied slots before the window and ignores waiting review, notices and later moves', () => {
    const other = questOf(3, [], { territory: 'another' });
    const events = [
      move(0, 'working'),
      move(1, 'working', SECOND),
      move(2, 'working', other),
      lineOf('quest.unclaimable', {}, at(3)),
      lineOf('quest.submitted', {}, at(4)),
      { ...move(0, 'review'), ts: at(0, '2026-11-09') },
      { ...move(1, 'review', SECOND, true), ts: at(1, '2026-11-09') },
      { ...move(2, 'review', FIRST, true), ts: at(2, '2026-11-09') },
      { ...move(3, 'done'), ts: at(3, '2026-11-10') },
    ];
    expect(checkModesOf(events, { since: '2026-11-09', until: '2026-11-09' }).peaks).toEqual([
      { territory: 'another', working: 1, review: 0, healing: 0 },
      { territory: 'elvaria', working: 2, review: 2, healing: 0 },
    ]);
    expect(checkModesOf(events.slice(0, 3), { since: '2026-11-09' }).peaks).toEqual([
      { territory: 'another', working: 1, review: 0, healing: 0 },
      { territory: 'elvaria', working: 2, review: 0, healing: 0 },
    ]);
  });

  it('handles verifier release, pre-window active quests, and territory migration', () => {
    const q3 = questOf(3, [], { territory: 'elvaria' });
    const q3Other = questOf(3, [], { territory: 'another' });
    const events = [
      check('check.start', 0),
      move(1, 'working', FIRST),
      { ...move(0, 'review', FIRST, true), ts: at(0, '2026-11-09') },
      { ...move(1, 'review', FIRST, false), ts: at(1, '2026-11-09') },
      { ...move(2, 'review', SECOND, true), ts: at(2, '2026-11-09') },
      { ...move(3, 'working', q3), ts: at(3, '2026-11-09') },
      { ...move(4, 'working', q3Other), ts: at(4, '2026-11-09') },
      { ...move(5, 'done', q3Other), ts: at(0, '2026-11-10') },
    ];
    expect(questPeaksOf(events, { since: '2026-11-09', until: '2026-11-09' })).toEqual([
      { territory: 'another', working: 1, review: 0, healing: 0 },
      { territory: 'elvaria', working: 1, review: 1, healing: 0 },
    ]);
  });

  it('tracks peaks on a large log with hundreds of overlapping quests across territories', () => {
    const events: ReturnType<typeof move>[] = [];
    for (let i = 0; i < 100; i++) {
      const qE = questOf(100 + i, [], { territory: 'elvaria' });
      events.push(move(3 * i, 'working', qE));
      events.push(move(3 * i + 31, 'review', qE, true));
      events.push(move(3 * i + 47, 'done', qE));

      const qA = questOf(500 + i, [], { territory: 'another' });
      events.push(move(3 * i + 1, 'working', qA));
      events.push(move(3 * i + 40, 'review', qA, true));
      events.push(move(3 * i + 59, 'done', qA));
    }
    events.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

    const peaks = questPeaksOf(events, {});
    expect(peaks).toEqual([
      { territory: 'another', working: 13, review: 7, healing: 0 },
      { territory: 'elvaria', working: 11, review: 6, healing: 0 },
    ]);
  });
});

describe('carried checks in the check modes ledger (RC-04)', () => {
  const FROM = '01KAAAAAAAAAAAAAAAAAAAAAAA';
  const carried = { id: 'test', pass: true, duration_ms: 0, carried_from: FROM };
  const patrol = (checks: readonly Record<string, unknown>[]) =>
    lineOf(
      'patrol.ran',
      { territory: 'elvaria', head: null, trigger: 'merged', setup: null, checks, scans: [] },
      at(30),
    );

  it('a run or a patrol whose every check was carried is no sample of time and no full run of the day', () => {
    const log = [
      check('check.start', 0),
      check('check.end', 0, { outcome: 'pass', checks: [carried] }),
      check('check.start', 1, {}, 2),
      check(
        'check.end',
        4,
        { outcome: 'pass', checks: [carried, { id: 'lint', pass: true, duration_ms: 1000 }] },
        2,
      ),
      patrol([
        { id: 'test', pass: true, duration_ms: 0, timed_out: false, environment: false, carried_from: FROM },
      ]),
    ];
    const metrics = checkModesOf(log, {});
    expect(metrics.durations).toEqual([
      { mode: 'full', count: 1, median_minutes: 3, p90_minutes: 3 },
      { mode: 'narrow', count: 0, median_minutes: null, p90_minutes: null },
      { mode: 'patrol', count: 0, median_minutes: null, p90_minutes: null },
    ]);
    expect(metrics.full_by_day).toEqual([{ day: '2026-11-08', count: 1 }]);
  });
});
