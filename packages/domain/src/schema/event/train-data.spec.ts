// The `train.ran` line (CM-08): one per train that left, whatever its end, so a train stopped before origin's branch
// was read has no base, and one nobody was left aboard (each quest left it) has no head.
import { describe, expect, it } from 'vitest';

import { EVENT_VERSION, EventSchema } from './event.ts';

const BASE = '4bc14e9d0c2a7f1e3b5d6a8c9e0f1a2b3c4d5e6f';
const QUEST = 'q_20261115_7k3m2a';
const TRAIN = { territory: 'elvaria', train: '01JCF8X4Z6Q3W9N2M5R7T8V0YC', departure: 'full' };

const line = (data: Record<string, unknown>) => ({
  v: EVENT_VERSION,
  id: '01JCF8X4Z6Q3W9N2M5R7T8V0YB',
  ts: '2026-11-27T15:00:00+07:00',
  type: 'train.ran',
  actor: { kind: 'steward' },
  territory: 'elvaria',
  data,
});

const issuesOf = (value: unknown): string =>
  (EventSchema.safeParse(value).error?.issues ?? [])
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

describe('train.ran data', () => {
  it('takes a train stopped before its base was read, and one every quest left, with no head', () => {
    const fetchFailed = { ...TRAIN, outcome: 'stopped', detail: 'fatal: could not read from remote' };
    const nobody = { ...TRAIN, base: BASE, outcome: 'stopped', left: [{ quest: QUEST, reason: 'conflict' }] };
    expect([issuesOf(line(fetchFailed)), issuesOf(line(nobody))]).toEqual(['', '']);
  });

  it('refuses an outcome it does not know and a step without its merge commit', () => {
    expect(issuesOf(line({ ...TRAIN, base: BASE, outcome: 'empty' }))).toContain('data.outcome');
    const step = { ...TRAIN, base: BASE, outcome: 'red', steps: [{ quest: QUEST }] };
    expect(issuesOf(line(step))).toContain('data.steps.0.commit');
  });
});
