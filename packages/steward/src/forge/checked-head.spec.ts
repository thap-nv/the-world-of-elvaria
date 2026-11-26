import { describe, expect, it } from 'vitest';

import { checkedHeadEnv } from './checked-head.ts';
import type { Verdict } from '@elvaria/domain';

const HEAD = 'a'.repeat(40);
const AT = '2026-11-25T10:00:00Z';
const CHECK = {
  id: 'unit' as Verdict['checks'][number]['id'],
  pass: true,
  duration_ms: 1,
  log_path: 'unit.log',
};
const VERDICT: Pick<Verdict, 'result' | 'checks' | 'created_at'> = {
  result: 'pass',
  checks: [CHECK],
  created_at: AT,
};

describe('the checked head named to a push (RC-02)', () => {
  it('names the head of a green queue run without consulting its older verdict', async () => {
    expect(await checkedHeadEnv(HEAD, 'checked', () => Promise.reject(new Error('unreadable')))).toEqual({
      ELVARIA_CHECKED_HEAD: HEAD,
    });
  });

  it('does not use a verdict after the queue set checks aside or selected none', async () => {
    expect(
      await checkedHeadEnv(HEAD, 'unchecked', () => Promise.resolve({ verdict: VERDICT, committed_at: AT })),
    ).toEqual({});
  });

  it.each([['2026-11-25T09:59:59Z'], [AT], ['2026-11-25T17:00:00+07:00']])(
    'accepts a pass with checks when HEAD was committed at %s',
    async (committed_at) => {
      expect(
        await checkedHeadEnv(HEAD, undefined, () => Promise.resolve({ verdict: VERDICT, committed_at })),
      ).toEqual({
        ELVARIA_CHECKED_HEAD: HEAD,
      });
    },
  );

  it.each([
    { verdict: undefined, committed_at: AT },
    { verdict: { ...VERDICT, result: 'fail' as const }, committed_at: AT },
    { verdict: { ...VERDICT, result: 'partial' as const }, committed_at: AT },
    { verdict: { ...VERDICT, checks: [] }, committed_at: AT },
    { verdict: { ...VERDICT, checks: [CHECK, { ...CHECK, pass: false }] }, committed_at: AT },
    { verdict: VERDICT, committed_at: '2026-11-25T10:00:01Z' },
    { verdict: VERDICT, committed_at: undefined },
    { verdict: VERDICT, committed_at: 'not a date' },
    { verdict: { ...VERDICT, created_at: 'not a date' }, committed_at: AT },
  ])('omits the stamp for insufficient evidence %j', async (evidence) => {
    expect(await checkedHeadEnv(HEAD, undefined, () => Promise.resolve(evidence))).toEqual({});
  });

  it('keeps delivery possible when reading the verdict or git throws', async () => {
    expect(await checkedHeadEnv(HEAD, undefined, () => Promise.reject(new Error('EACCES')))).toEqual({});
  });
});
