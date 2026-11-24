import { describe, expect, it } from 'vitest';

import { EVENT_VERSION, EventSchema } from './event.ts';

const patrol = (id: string) => ({
  v: EVENT_VERSION,
  id: '01JF0000000000000000000000',
  ts: '2026-11-24T06:30:00+07:00',
  type: 'patrol.ran',
  actor: { kind: 'steward' },
  data: {
    territory: 'elvaria',
    head: 'a'.repeat(40),
    trigger: 'schedule',
    setup: null,
    checks: [
      { id, pass: true, duration_ms: 1, timed_out: false, environment: false, log_path: 'checks/unit.log' },
    ],
    scans: [],
  },
});

describe('patrol.ran check ids', () => {
  it.each(['typecheck', 'test', 'lint', 'docs_gen', 'e2e'])('accepts the territory check id %s', (id) => {
    expect(EventSchema.safeParse(patrol(id)).success).toBe(true);
  });

  it.each(['Typecheck', 'docs-gen'])('refuses a check id outside snake_case: %s', (id) => {
    const result = EventSchema.safeParse(patrol(id));
    expect(result.success).toBe(false);
    expect(result.error?.issues.map(({ path }) => path)).toContainEqual(['data', 'checks', 0, 'id']);
  });
});
