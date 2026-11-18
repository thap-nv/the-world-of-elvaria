// The merges without the seal per territory (PS-08b): what the owner weighs the delegation of the seal by.
import { describe, expect, it } from 'vitest';

import { EventSchema } from '../schema/event/event.ts';
import { unsealedCountsOf } from './unsealed-counts.ts';
import type { Event } from '../schema/event/event.ts';

let serial = 0;
const merged = (territory: string, sealed: boolean, day = '2026-11-18'): Event => {
  serial += 1;
  const quest = `q_20261118_aaaaa${serial}`;
  return EventSchema.parse({
    v: 2,
    id: `01JE${String(serial).padStart(22, '0')}`,
    ts: `${day}T09:00:00+07:00`,
    type: 'delivery.merged',
    actor: { kind: 'steward' },
    quest,
    data: {
      quest,
      territory,
      branch: `quest/${quest}`,
      head: 'a'.repeat(40),
      pr: { number: serial, url: `https://github.com/o/r/pull/${serial}` },
      merge_sha: 'b'.repeat(40),
      method: 'merge',
      sealed,
      branch_deleted: true,
    },
  });
};

describe('unsealedCountsOf', () => {
  it("counts each territory's merges by the Steward and those without the seal, by territory id", () => {
    const events = [
      merged('handbook', false),
      merged('dc1', true),
      merged('dc1', false),
      merged('dc1', false),
    ];
    expect(unsealedCountsOf(events, {})).toEqual([
      { territory: 'dc1', merged: 3, unsealed: 2 },
      { territory: 'handbook', merged: 1, unsealed: 1 },
    ]);
  });

  it('counts only the window, and nothing without a merge', () => {
    const events = [merged('dc1', false, '2026-11-16'), merged('dc1', true)];
    expect(unsealedCountsOf(events, { since: '2026-11-17' })).toEqual([
      { territory: 'dc1', merged: 1, unsealed: 0 },
    ]);
    expect(unsealedCountsOf([], {})).toEqual([]);
  });
});
