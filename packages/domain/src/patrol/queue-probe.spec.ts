// Step 4 of the probe in the merge queue (CM-06): the mode the run after the session used, the red checks it already
// proved green with the queue's own command, and the queue's `check.attributed` from the run on the quest's head.
import { describe, expect, it } from 'vitest';

import { EventSchema } from '../schema/event/event.ts';
import { ownRunChecksOf, queueAttributionOf, queueFlakyOf, sessionModeOf } from './queue-probe.ts';
import type { QuestId, TerritoryId } from '../core/ids.ts';
import type { Event } from '../schema/event/event.ts';
import type { OwnRunInput } from './queue-probe.ts';

const QUEST = 'q_20261124_a1b2c3' as QuestId;
const OTHER = 'q_20261124_d4e5f6' as QuestId;
const TERRITORY = 'elvaria' as TerritoryId;
const SHA = 'c'.repeat(40);

let serial = 0;
const end = (quest: QuestId, data: Record<string, unknown> = {}): Event => {
  serial += 1;
  return EventSchema.parse({
    v: 2,
    id: `01JD${String(serial).padStart(22, '0')}`,
    ts: '2026-11-24T08:00:00+07:00',
    type: 'check.end',
    actor: { kind: 'steward' },
    quest,
    data: { outcome: 'pass', checks: [], ...data },
  });
};

describe('sessionModeOf', () => {
  it("reads the quest's latest run after a session, not the queue's nor another quest's", () => {
    const events = [end(QUEST, { mode: 'narrow' }), end(QUEST, { delivery: true }), end(OTHER)];
    expect(sessionModeOf(events, QUEST)).toBe('narrow');
    expect(sessionModeOf([...events, end(QUEST)], QUEST)).toBeUndefined();
  });

  it('says full when the log holds no run of the quest', () => {
    expect(sessionModeOf([end(OTHER, { mode: 'narrow' })], QUEST)).toBeUndefined();
  });
});

describe('ownRunChecksOf', () => {
  const input = (over: Partial<OwnRunInput> = {}): OwnRunInput => ({
    red: ['test', 'lint'],
    session: [
      { id: 'test', pass: true },
      { id: 'lint', pass: true },
    ],
    session_mode: 'narrow',
    queue_mode: 'narrow',
    checks: [
      { id: 'test', run: 'pnpm test', narrow: 'pnpm test:changed' },
      { id: 'lint', run: ['pnpm lint'] },
    ],
    ...over,
  });

  it('runs none that ran green after the session with the same command', () => {
    expect(ownRunChecksOf(input())).toEqual([]);
    expect(ownRunChecksOf(input({ session_mode: undefined, queue_mode: undefined }))).toEqual([]);
  });

  it('runs a check whose command differs, one red or not run after the session, and one the territory lost', () => {
    // A full queue run gives `test` its `run`, the narrow session gave it `narrow`; `lint` has one command only.
    expect(ownRunChecksOf(input({ queue_mode: undefined }))).toEqual(['test']);
    expect(ownRunChecksOf(input({ session: [{ id: 'test', pass: false }] }))).toEqual(['test', 'lint']);
    expect(ownRunChecksOf(input({ checks: [] }))).toEqual(['test', 'lint']);
    expect(ownRunChecksOf(input({ red: ['setup'] }))).toEqual(['setup']);
  });
});

describe('queueAttributionOf', () => {
  const run = (red: boolean | undefined) => ({ commit: SHA, quest: QUEST, red, duration_ms: 1200 });

  it('blames its own change when the checks fail on its own head', () => {
    expect(
      queueAttributionOf({ territory: TERRITORY, quest: QUEST, checks: ['test'], run: run(true) }),
    ).toEqual({
      territory: TERRITORY,
      source: 'queue',
      checks: ['test'],
      runs: [{ commit: SHA, quest: QUEST, pass: false, duration_ms: 1200 }],
      culprit: QUEST,
      cause: 'own_change',
    });
  });

  it('finds a combination when they pass there, or ran no run for checks proven green after the session', () => {
    const green = queueAttributionOf({
      territory: TERRITORY,
      quest: QUEST,
      checks: ['test'],
      run: run(false),
    });
    expect([green.cause, green.culprit, green.runs[0]?.pass]).toEqual(['combination', QUEST, true]);
    const proven = queueAttributionOf({ territory: TERRITORY, quest: QUEST, checks: ['test'] });
    expect([proven.cause, proven.culprit, proven.runs]).toEqual(['combination', QUEST, []]);
  });

  it('cannot say, and blames nobody, when the run could not say', () => {
    const unknown = queueAttributionOf({
      territory: TERRITORY,
      quest: QUEST,
      checks: ['test'],
      run: run(undefined),
    });
    expect(unknown.cause).toBe('unknown');
    expect(unknown).not.toHaveProperty('culprit');
  });
});

describe('queueFlakyOf', () => {
  const again = (red: boolean | undefined) => ({ commit: SHA, red, duration_ms: 900 });

  it('(RC-04, K5) red checks green on their second run are flaky; red again, or a run that cannot say, is not', () => {
    expect(queueFlakyOf({ territory: TERRITORY, checks: ['test'], run: again(false) })).toEqual({
      territory: TERRITORY,
      source: 'queue',
      checks: ['test'],
      runs: [{ commit: SHA, pass: true, duration_ms: 900 }],
      commit: SHA,
      cause: 'flaky',
    });
    expect(queueFlakyOf({ territory: TERRITORY, checks: ['test'], run: again(true) })).toBeUndefined();
    expect(queueFlakyOf({ territory: TERRITORY, checks: ['test'], run: again(undefined) })).toBeUndefined();
  });
});
