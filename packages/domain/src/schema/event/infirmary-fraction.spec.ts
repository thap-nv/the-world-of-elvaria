import { describe, expect, it } from 'vitest';

import { QUEST_CHANGE } from './__fixtures__/valid-data.ts';
import { EVENT_VERSION, EventSchema } from './event.ts';

const line = (minutes: unknown, limit: unknown) => ({
  v: EVENT_VERSION,
  id: '01JCF8X4Z6Q3W9N2M5R7T8V0YB',
  ts: '2026-11-06T10:07:30+07:00',
  type: 'quest.infirmary',
  actor: { kind: 'steward' },
  data: {
    ...QUEST_CHANGE,
    trip: 'time',
    reason: { code: 'breaker:time', params: { minutes, limit } },
  },
});

describe('percentage-based time breaker reason', () => {
  it('accepts fractional minute parameters at event v2 and preserves old integer parameters', () => {
    for (const minutes of [45, 67.5]) {
      const event = line(minutes, minutes);
      expect(EventSchema.parse(event)).toEqual(event);
    }
  });

  it.each([NaN, Infinity, true, null])('rejects invalid numeric reason parameters: %j', (value) => {
    expect(EventSchema.safeParse(line(value, 67.5)).success).toBe(false);
    expect(EventSchema.safeParse(line(67.5, value)).success).toBe(false);
  });
});
