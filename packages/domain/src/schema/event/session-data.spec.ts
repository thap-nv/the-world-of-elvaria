// `agent.session.usage` (PS-28): what a line must say for a reader to draw the bar without kingdom.json.
import { describe, expect, it } from 'vitest';

import { EventSchema } from './event.ts';
import { EVENT_DATA_SCHEMAS } from './event-data.ts';

const schema = EVENT_DATA_SCHEMAS['agent.session.usage'];
const data = {
  role: 'assignee',
  measure: 'time',
  used: 40.5,
  limit: 45,
  pct: 90,
  soft_pct: 85,
  hard_pct: 150,
};

describe('agent.session.usage data', () => {
  it.each(['time', 'tokens', 'turns'])('accepts the %s measure with fractional figures', (measure) => {
    expect(schema.parse({ ...data, measure })).toEqual({ ...data, measure });
  });

  it("accepts a judge's line and thresholds other than the defaults", () => {
    const judge = { ...data, role: 'verifier', soft_pct: 75.5, hard_pct: 200 };
    expect(schema.parse(judge)).toEqual(judge);
  });

  it.each([
    { role: 'chancellor' },
    { measure: 'cost' },
    { used: -1 },
    { limit: 0 },
    { pct: -1 },
    { soft_pct: 0 },
    { hard_pct: -150 },
    { notch: 6 },
    { role: undefined },
    { measure: undefined },
    { used: undefined },
    { limit: undefined },
    { pct: undefined },
    { soft_pct: undefined },
    { hard_pct: undefined },
  ])('rejects invalid or missing data: %j', (change) => {
    expect(schema.safeParse({ ...data, ...change }).success).toBe(false);
  });

  it('is checked on the line the Steward writes, under its envelope', () => {
    const line = {
      v: 2,
      id: '01JCFBPS28STAM1NA000000001',
      ts: '2026-11-19T10:00:00+07:00',
      type: 'agent.session.usage',
      actor: { kind: 'steward' },
      quest: 'q_20261117_m8d5t2',
      attempt: 1,
      session: 'e1b2c3d4',
      data,
    };
    expect(EventSchema.safeParse(line).success).toBe(true);
    expect(EventSchema.safeParse({ ...line, data: { ...data, role: undefined } }).success).toBe(false);
  });
});
