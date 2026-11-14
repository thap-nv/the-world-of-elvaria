import { EVENT_VERSION } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { asleepFromLog, createManaBook, isAsleep, levelsFromLog } from './book.ts';
import type { Event } from '@elvaria/domain';

function line(type: string, data: unknown): Event {
  const event: Event = {
    v: EVENT_VERSION,
    id: '01JCF8X4Z6Q3W9N2M5R7T8V0YB' as Event['id'],
    ts: '2026-11-07T09:00:00+07:00',
    type,
    actor: { kind: 'steward' },
    data: data as Event['data'],
  };
  return event;
}

describe('asleepFromLog', () => {
  it('keeps the pools whose last line is mana.exhausted', () => {
    const events = [
      line('mana.exhausted', { tribe: 'claude', pool: 'claude' }),
      line('mana.exhausted', { tribe: 'gemini', pool: 'gemini_models' }),
      line('quest.created', {}),
      line('mana.restored', { tribe: 'claude', pool: 'claude' }),
      line('mana.exhausted', { tribe: 'gemini', pool: 'gemini_models' }),
    ];
    expect(asleepFromLog(events)).toEqual([{ tribe: 'gemini', pool: 'gemini_models' }]);
  });

  it('skips a line without its pool', () => {
    expect(
      asleepFromLog([line('mana.exhausted', { tribe: 'claude' }), line('mana.exhausted', null)]),
    ).toEqual([]);
  });

  it('starts with nothing asleep', () => {
    const book = createManaBook();
    expect(isAsleep(book, { tribe: 'claude' as never, pool: 'claude' })).toBe(false);
  });
});

// The history the shares of a window are measured from again after a restart (P1-48).
describe('levelsFromLog', () => {
  it('reads each mana.level line as the reading it told, observed when it was written', () => {
    const week = { tribe: 'gemini', pool: 'gemini_models', window: 'weekly', source: 'rate_limits' };
    const events = [
      line('mana.level', { ...week, model: 'argon', used_pct: 93, resets_at: '2026-11-14T00:00:00Z' }),
      line('mana.warning', { ...week, used_pct: 93 }),
      line('mana.level', { ...week, used_pct: 100 }),
      line('mana.level', { ...week, used_pct: 'full' }),
    ];
    const observed = { observed_at: '2026-11-07T09:00:00+07:00' };
    expect(levelsFromLog(events)).toEqual([
      {
        ...week,
        ...observed,
        model: 'argon',
        used_pct: 93,
        resets_at: '2026-11-14T00:00:00Z',
        exhausted: false,
      },
      { ...week, ...observed, used_pct: 100, resets_at: null, exhausted: true },
    ]);
  });
});
