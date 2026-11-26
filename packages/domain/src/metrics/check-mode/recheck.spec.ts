import { describe, expect, it } from 'vitest';

import { checkModesOf } from './check-modes.ts';
import { carriedThenRedOf, recheckOf } from './recheck.ts';
import { CARRIED, REAL, RECHECK_LOG, patrol, pushed } from './__fixtures__/recheck.ts';
import { FIRST, SECOND, check } from './__fixtures__/log.ts';
import { at, lineOf } from '../__fixtures__/ledger.ts';
import { merged } from '../../patrol/__fixtures__/patrol-log.ts';

describe('recheck ledger (RC-07)', () => {
  it('counts real runs, carries, patrol regressions and push minutes from one log', () => {
    const report = checkModesOf(RECHECK_LOG, {});
    expect(report.recheck).toEqual({
      runs_per_check: [{ check: 'test', median: 2, max: 2 }],
      carried_by_day: [{ day: '2026-11-08', count: 2 }],
      carried_then_red: [{ territory: 'elvaria', check: 'test', tree: 'a'.repeat(40), at: at(8) }],
    });
    expect(report.merged_cost).toEqual({
      quests: [{ quest: FIRST.id, minutes: 4, push_minutes: 2 }],
      median_minutes: 4,
      total_minutes: 4,
    });
  });

  it('uses first merges, historical runs and zero runs for merged quests missing a check', () => {
    const events = [
      ...RECHECK_LOG,
      check('check.end', 9, { outcome: 'pass', checks: [REAL] }),
      pushed(10, 600000),
      merged(at(11), FIRST.id),
      { ...check('check.end', 12, { outcome: 'fail', checks: [{ ...REAL, id: 'lint' }] }), quest: SECOND.id },
      merged(at(13), SECOND.id),
    ];
    expect(recheckOf(events, {}).runs_per_check).toEqual([
      { check: 'lint', median: 0.5, max: 1 },
      { check: 'test', median: 1, max: 2 },
    ]);
    expect(checkModesOf(events, {}).merged_cost.total_minutes).toBe(5);
    expect(recheckOf(events, { since: '2026-11-09' }).runs_per_check).toEqual([]);
    expect(recheckOf(events, { until: '2026-11-07' }).carried_by_day).toEqual([]);
  });

  it('ignores incomplete outcomes, guest checks and checks after the first merge outside the window', () => {
    const events = [
      ...RECHECK_LOG,
      check('check.end', 9, { outcome: 'error', checks: [REAL] }),
      lineOf('check.end', { outcome: 'pass', checks: [REAL] }, at(10)),
      merged(at(0, '2026-11-09'), FIRST.id),
    ];
    expect(recheckOf(events, { since: '2026-11-09' }).runs_per_check).toEqual([]);
    expect(recheckOf(events, {}).runs_per_check).toEqual([{ check: 'test', median: 2, max: 2 }]);
    expect(recheckOf([], {})).toEqual({ runs_per_check: [], carried_by_day: [], carried_then_red: [] });
  });

  it('groups carries by calendar day in order, including guest entries and carried-only checks', () => {
    const events = [
      { ...patrol(0, [CARRIED]), ts: at(0, '2026-11-09') },
      check('check.end', 1, { outcome: 'pass', checks: [{ ...CARRIED, id: 'lint' }] }),
      lineOf('check.end', { outcome: 'pass', checks: [CARRIED] }, at(2)),
      merged(at(3), FIRST.id),
    ];
    expect(recheckOf(events, {}).carried_by_day).toEqual([
      { day: '2026-11-08', count: 2 },
      { day: '2026-11-09', count: 1 },
    ]);
    expect(recheckOf(events, {}).runs_per_check).toEqual([{ check: 'lint', median: 0, max: 0 }]);
  });

  it('requires the previous patrol of that territory and tree to have carried the failing check', () => {
    const red = { ...REAL, pass: false };
    const events = [
      patrol(0, [CARRIED]),
      patrol(1, [red], { tree: 'b'.repeat(40) }),
      patrol(2, [red], { territory: 'other' }),
      patrol(3, [red], { tree: undefined }),
      patrol(4, [{ ...red, environment: true }]),
      patrol(5, [red]),
      patrol(6, [CARRIED]),
      patrol(7, [REAL]),
      patrol(8, [red]),
      patrol(9, [CARRIED]),
      patrol(10, []),
      patrol(11, [red]),
    ];
    expect(carriedThenRedOf(events, {})).toEqual([]);
    expect(carriedThenRedOf(RECHECK_LOG, { since: '2026-11-09' })).toEqual([]);
    expect(carriedThenRedOf(RECHECK_LOG, { until: '2026-11-07' })).toEqual([]);
    const history = [patrol(0, [CARRIED]), { ...patrol(1, [red]), ts: at(1, '2026-11-09') }];
    expect(carriedThenRedOf(history, { since: '2026-11-09' })).toEqual([
      { territory: 'elvaria', check: 'test', tree: 'a'.repeat(40), at: at(1, '2026-11-09') },
    ]);
  });
});
