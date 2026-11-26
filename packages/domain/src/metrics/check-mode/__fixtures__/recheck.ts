import { delivered, merged, ran, SHA_A } from '../../../patrol/__fixtures__/patrol-log.ts';
import { at } from '../../__fixtures__/ledger.ts';
import { FIRST, check } from './log.ts';
import type { Event } from '../../../schema/event/event.ts';

export const CARRIED = {
  id: 'test',
  pass: true,
  duration_ms: 0,
  carried_from: '01KAAAAAAAAAAAAAAAAAAAAAAA',
};
export const REAL = { id: 'test', pass: true, duration_ms: 60000 };
export const patrol = (minute: number, checks: readonly Record<string, unknown>[], extra = {}) =>
  ran(at(minute), [], {
    tree: SHA_A,
    checks: checks.map((row) => ({
      timed_out: false,
      environment: false,
      ...(row.carried_from === undefined ? { log_path: '.runs/patrol/check.log' } : {}),
      ...row,
    })),
    ...extra,
  });
export const pushed = (minute: number, push_ms?: number): Event => {
  const event = delivered(at(minute), FIRST.id, SHA_A);
  return { ...event, data: { ...event.data, ...(push_ms === undefined ? {} : { push_ms }) } } as Event;
};
export const RECHECK_LOG = [
  check('check.end', 1, { outcome: 'pass', checks: [REAL] }),
  check('check.end', 2, { outcome: 'pass', checks: [CARRIED] }),
  check('check.end', 3, { outcome: 'fail', checks: [{ ...REAL, pass: false }] }),
  pushed(4, 60000),
  pushed(5, 60000),
  pushed(5),
  merged(at(6), FIRST.id),
  patrol(7, [CARRIED]),
  patrol(8, [{ ...REAL, pass: false }]),
];
