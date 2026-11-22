import { infirmaryReasonOf } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { APPRENTICE_LEFT, OUT_OF_ATTEMPTS, infirmaryData, pathsSaid, refusedPatchOf } from './infirmary.ts';

describe('infirmary data', () => {
  it('preserves the coded cause and structured detail without empty output', () => {
    const reason = infirmaryReasonOf('breaker:patch', { file: 'elvaria.patch', why: 'does not apply' });
    const detail = { patch: 'does not apply', message: '' };
    expect(infirmaryData({ trip: 'commit', reason, detail })).toEqual({
      trip: 'commit',
      reason,
      detail: { patch: 'does not apply' },
    });
    expect(infirmaryData(OUT_OF_ATTEMPTS)).toEqual({
      trip: 'max_attempts',
      reason: { code: 'quest:max_attempts', params: {} },
    });
  });

  it('names ten paths at most and counts the rest', () => {
    const paths = Array.from({ length: 12 }, (_, index) => `infra/secrets/${index}.key`);
    expect(pathsSaid(paths)).toBe(`${paths.slice(0, 10).join(', ')} and 2 more`);
    expect(pathsSaid(paths.slice(0, 10))).toBe(paths.slice(0, 10).join(', '));
  });
});

describe('refusedPatchOf', () => {
  const why = 'it touches src/app.ts, outside laws.patch_paths (.husky/**)';
  const text = `breaker:commit: elvaria.patch was not applied: ${why}`;

  it('reads detail even without a trip', () => {
    const reason = infirmaryReasonOf('breaker:patch', { file: 'elvaria.patch', why });
    expect(refusedPatchOf({ reason, detail: { patch: why } })).toBe(why);
    expect(refusedPatchOf({ reason, trip: 'commit', detail: { patch: why } })).toBe(why);
  });

  it('reads historical text only when no trip exists', () => {
    const reason = infirmaryReasonOf('legacy', { text });
    expect(refusedPatchOf({ reason })).toBe(why);
    const extended = infirmaryReasonOf('legacy', { text: `${text}${APPRENTICE_LEFT}` });
    expect(refusedPatchOf({ reason: extended })).toBe(why);
    expect(refusedPatchOf({ reason, trip: 'commit' })).toBeUndefined();
    expect(refusedPatchOf({ reason: infirmaryReasonOf('legacy', { text: 'breaker:time' }) })).toBeUndefined();
    expect(refusedPatchOf({ reason: OUT_OF_ATTEMPTS.reason })).toBeUndefined();
  });
});
