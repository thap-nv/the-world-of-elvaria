import { describe, expect, it } from 'vitest';

import { EVENT_DATA_SCHEMAS } from './event-data.ts';

const schema = EVENT_DATA_SCHEMAS['agent.session.wrap_up'];
const data = { measure: 'time', used: 38.5, limit: 45, pct: 85.55555555555556 };

describe('agent.session.wrap_up data', () => {
  it.each(['time', 'tokens', 'turns'])('accepts the %s measure and fractional usage', (measure) => {
    expect(schema.parse({ ...data, measure })).toEqual({ ...data, measure });
  });

  it.each([
    { measure: 'cost' },
    { used: -1 },
    { limit: 0 },
    { pct: -1 },
    { extra: true },
    { measure: undefined },
    { used: undefined },
    { limit: undefined },
    { pct: undefined },
  ])('rejects invalid or missing data: %j', (change) => {
    expect(schema.safeParse({ ...data, ...change }).success).toBe(false);
  });
});
