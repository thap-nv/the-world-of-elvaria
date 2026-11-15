import { describe, expect, it } from 'vitest';

import { CAP_TRIPS, BREAKER_TRIPS } from '../quest/events.ts';
import { cutCallOf, endedInCut, isCapTrip } from './continue.ts';
import type { CharacterId } from '../core/ids.ts';
import type { Attempt } from '../schema/quest/quest-parts.ts';

const THORN = 'thorn' as CharacterId;
const entry = (n: number, extra: Partial<Attempt> = {}, role: Attempt['role'] = 'assignee'): Attempt => ({
  n,
  character: THORN,
  role,
  started_at: '2026-11-15T09:00:00+07:00',
  run_dir: `.runs/q_20261115_aaaaaa-${n}`,
  ...extra,
});

describe('isCapTrip', () => {
  it('holds for time, tokens and turns only', () => {
    expect(BREAKER_TRIPS.filter(isCapTrip)).toEqual([...CAP_TRIPS]);
  });
});

describe('cutCallOf', () => {
  it('goes on for a cut with progress, whatever came before', () => {
    expect(cutCallOf([entry(1, { progress: false }), entry(1)], true)).toBe('go_on');
  });

  it('goes on for a first cut without progress, and for a log without a session', () => {
    expect(cutCallOf([entry(1)], false)).toBe('go_on');
    expect(cutCallOf([], false)).toBe('go_on');
  });

  it('stops at the second cut in a row without progress in the same run', () => {
    expect(cutCallOf([entry(1, { progress: false }), entry(1)], false)).toBe('infirmary');
  });

  it('goes on when the cut before made progress, did not end in a cut, or belongs to an earlier run', () => {
    expect(cutCallOf([entry(1, { progress: true }), entry(1)], false)).toBe('go_on');
    expect(cutCallOf([entry(1, { outcome: 'paused' }), entry(1)], false)).toBe('go_on');
    expect(cutCallOf([entry(1, { progress: false }), entry(2)], false)).toBe('go_on');
  });

  it('reads assignee entries only', () => {
    const judge = entry(1, { progress: false }, 'verifier');
    expect(cutCallOf([entry(1, { progress: false }), judge, entry(1)], false)).toBe('infirmary');
  });
});

describe('endedInCut', () => {
  it('holds when the latest assignee session carries progress, either way', () => {
    expect(endedInCut([entry(1, { progress: true })])).toBe(true);
    expect(endedInCut([entry(1, { progress: false })])).toBe(true);
  });

  it('does not hold for a session without it, an earlier cut, or an empty log', () => {
    expect(endedInCut([entry(1, { progress: true }), entry(1)])).toBe(false);
    expect(endedInCut([entry(1)])).toBe(false);
    expect(endedInCut([])).toBe(false);
  });
});
