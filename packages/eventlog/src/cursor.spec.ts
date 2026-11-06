import { describe, expect, it } from 'vitest';

import { isEventCursor, nextCursor, oldestDay, sameCursor } from './cursor.ts';

describe('EventCursor', () => {
  it('accepts what a reader saved and rejects anything else', () => {
    expect(isEventCursor({})).toBe(true);
    expect(isEventCursor({ '2026-11-06': 0, '2026-11-07': 1234 })).toBe(true);
    expect(isEventCursor(JSON.parse(JSON.stringify({ '2026-11-06': 77 })))).toBe(true);
    for (const bad of [null, [], 'x', 3, { today: 1 }, { '2026-11-06': -1 }, { '2026-11-06': 1.5 }]) {
      expect(isEventCursor(bad)).toBe(false);
    }
    expect(isEventCursor({ '2026-11-06': '12' })).toBe(false);
  });

  it('finds the oldest day it still watches', () => {
    expect(oldestDay({})).toBeUndefined();
    expect(oldestDay({ '2026-11-07': 5, '2026-11-06': 9 })).toBe('2026-11-06');
  });

  it('compares day by day', () => {
    expect(sameCursor({ '2026-11-06': 1 }, { '2026-11-06': 1 })).toBe(true);
    expect(sameCursor({ '2026-11-06': 1 }, { '2026-11-06': 2 })).toBe(false);
    expect(sameCursor({ '2026-11-06': 1 }, { '2026-11-07': 1 })).toBe(false);
    expect(sameCursor({ '2026-11-06': 1 }, { '2026-11-06': 1, '2026-11-07': 0 })).toBe(false);
  });

  it('keeps the newest two days after a read and names the days it is done with', () => {
    const offsets = new Map([
      ['2026-11-08', 30],
      ['2026-11-06', 10],
      ['2026-11-07', 20],
    ]);
    expect(nextCursor(offsets)).toEqual({
      cursor: { '2026-11-07': 20, '2026-11-08': 30 },
      done: ['2026-11-06'],
    });
    expect(nextCursor(new Map([['2026-11-06', 10]]))).toEqual({ cursor: { '2026-11-06': 10 }, done: [] });
  });
});
