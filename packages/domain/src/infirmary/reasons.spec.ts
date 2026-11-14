import { describe, expect, it } from 'vitest';

import { INFIRMARY_REASONS, INFIRMARY_REASON_PARAMS, infirmaryReasonOf } from './reasons.ts';
import { InfirmaryReasonSchema } from '../schema/event/state-data.ts';

describe('infirmary reasons', () => {
  it('builds reasons with explicit or empty parameters', () => {
    expect(infirmaryReasonOf('legacy', { text: 'old words' })).toEqual({
      code: 'legacy',
      params: { text: 'old words' },
    });
    expect(infirmaryReasonOf('quest:max_attempts')).toEqual({ code: 'quest:max_attempts', params: {} });
  });

  it.each(INFIRMARY_REASONS)('requires exactly the declared keys for %s', (code) => {
    const params = Object.fromEntries(INFIRMARY_REASON_PARAMS[code].map((key) => [key, 'value']));
    expect(InfirmaryReasonSchema.safeParse({ code, params }).success).toBe(true);
    const extra = InfirmaryReasonSchema.safeParse({ code, params: { ...params, extra: 1 } });
    expect(extra.error?.issues[0]?.path).toEqual(['params']);
    for (const key of Object.keys(params)) {
      const missing = Object.fromEntries(Object.entries(params).filter(([name]) => name !== key));
      expect(InfirmaryReasonSchema.safeParse({ code, params: missing }).error?.issues[0]?.path).toEqual([
        'params',
      ]);
    }
  });

  it('accepts integers and rejects fractional numbers and unknown codes', () => {
    expect(
      InfirmaryReasonSchema.safeParse(infirmaryReasonOf('breaker:time', { minutes: 45, limit: 45 })).success,
    ).toBe(true);
    expect(
      InfirmaryReasonSchema.safeParse(infirmaryReasonOf('breaker:time', { minutes: 1.5, limit: 45 })).success,
    ).toBe(false);
    expect(InfirmaryReasonSchema.safeParse({ code: 'unknown', params: {} }).success).toBe(false);
  });
});
