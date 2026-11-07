import { describe, expect, it } from 'vitest';

import { asleepFromLog, createManaBook, isAsleep } from './book.ts';
import type { Event } from '@elvaria/domain';

function line(type: string, data: unknown): Event {
  const event: Event = {
    v: 1,
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
