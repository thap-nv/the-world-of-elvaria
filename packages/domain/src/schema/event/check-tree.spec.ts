// The fields of the check ledger on `check.end` and `patrol.ran` (RC-03, ADR 0035, plans/recheck.md §3): all optional,
// so a line without them still reads; a carried check passed in no time, a patrol's has no log and a run one has one;
// a base belongs to a narrow run.
import { describe, expect, it } from 'vitest';

import { EVENT_VERSION, EventSchema } from './event.ts';

const TREE = 'a'.repeat(40);
const CONFIG = '0123456789abcdef';
const FROM = '01JC0000000000000000000001';

const line = (type: string, data: Record<string, unknown>) => ({
  v: EVENT_VERSION,
  id: '01JF0000000000000000000000',
  ts: '2026-11-26T08:00:00+07:00',
  type,
  actor: { kind: 'steward' },
  territory: 'elvaria',
  data,
});

const end = (data: Record<string, unknown>) =>
  line('check.end', { outcome: 'pass', checks: [{ id: 'lint', pass: true, duration_ms: 5 }], ...data });

const pathsOf = (value: unknown) =>
  (EventSchema.safeParse(value).error?.issues ?? []).map(({ path }) => path.join('.'));

describe('check.end', () => {
  it('reads a line with a tree, a config, a narrow base and a carried check', () => {
    const checks = [
      { id: 'lint', pass: true, duration_ms: 0, carried_from: FROM },
      { id: 'test', pass: true, duration_ms: 9 },
    ];
    const data = { mode: 'narrow', base: 'b'.repeat(40), tree: TREE, config: CONFIG, checks };
    expect(EventSchema.parse(end(data)).data).toEqual({ outcome: 'pass', ...data });
  });

  it('refuses a carried check that failed or took time, and a base on a run in full', () => {
    const carried = { id: 'lint', carried_from: FROM };
    expect(pathsOf(end({ checks: [{ ...carried, pass: false, duration_ms: 0 }] }))).toEqual([
      'data.checks.0',
    ]);
    expect(pathsOf(end({ checks: [{ ...carried, pass: true, duration_ms: 3 }] }))).toEqual(['data.checks.0']);
    expect(pathsOf(end({ base: 'b'.repeat(40) }))).toEqual(['data.base']);
  });

  it('reads a failed run taken back (RC-05), and refuses taken_back on a run that passed', () => {
    const red = { outcome: 'fail', checks: [{ id: 'lint', pass: false, duration_ms: 5 }] };
    const data = { ...red, tree: TREE, config: CONFIG, taken_back: true };
    expect(EventSchema.parse(end(data)).data).toEqual(data);
    expect(pathsOf(end({ taken_back: true }))).toEqual(['data.taken_back']);
  });

  it('refuses a tree or a config that is no hex digest of their length', () => {
    expect(pathsOf(end({ tree: 'HEAD', config: CONFIG }))).toEqual(['data.tree']);
    expect(pathsOf(end({ tree: TREE, config: `${CONFIG}0` }))).toEqual(['data.config']);
    expect(pathsOf(end({ tree: 'c'.repeat(64), config: CONFIG }))).toEqual([]);
  });
});

const patrol = (checks: readonly Record<string, unknown>[]) =>
  line('patrol.ran', {
    territory: 'elvaria',
    head: 'c'.repeat(40),
    trigger: 'merged',
    tree: TREE,
    config: CONFIG,
    setup: null,
    checks,
    scans: [],
  });

const RAN = { id: 'test', pass: true, duration_ms: 9, timed_out: false, environment: false };

describe('patrol.ran', () => {
  it('reads a carried check without a log next to one that ran with its log', () => {
    const checks = [
      { ...RAN, log_path: '.runs/patrol-elvaria/checks/test.log' },
      { ...RAN, id: 'lint', duration_ms: 0, carried_from: FROM },
    ];
    expect(EventSchema.parse(patrol(checks)).data).toMatchObject({ tree: TREE, config: CONFIG, checks });
  });

  it('refuses a carried check with a log, one that ran without, and a carried one that took time', () => {
    const log = { log_path: '.runs/patrol-elvaria/checks/test.log' };
    expect(pathsOf(patrol([{ ...RAN, duration_ms: 0, carried_from: FROM, ...log }]))).toEqual([
      'data.checks.0.log_path',
    ]);
    expect(pathsOf(patrol([RAN]))).toEqual(['data.checks.0.log_path']);
    expect(pathsOf(patrol([{ ...RAN, carried_from: FROM }]))).toEqual(['data.checks.0']);
  });
});
