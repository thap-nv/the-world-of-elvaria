import { EVENT_VERSION } from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import { asleepFromLog, createManaBook, isAsleep, levelsFromLog, outsideFromLog } from './book.ts';
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

// What tribe checks spent with the real CLI, counted by the estimate after a restart (run (221) (b)).
describe('outsideFromLog', () => {
  it('reads each tribe.checked line that spent tokens, when it was written, and skips the rest', () => {
    const checked = { tribe: 'gemini', model: 'gemini-3.8-flash-high', outcome: 'failed', checks: [] };
    const events = [
      line('tribe.checked', { ...checked, tokens: 21_216 }),
      line('tribe.checked', { ...checked, tokens: 0 }),
      line('tribe.checked', { ...checked, tokens: 'many' }),
      line('mana.level', { tribe: 'gemini', pool: 'gemini_models', window: 'weekly', used_pct: 3 }),
    ];
    expect(outsideFromLog(events)).toEqual([
      { tribe: 'gemini', model: 'gemini-3.8-flash-high', tokens: 21_216, at: '2026-11-07T09:00:00+07:00' },
    ]);
  });

  // fix/run-221-followups: the Chancellor's office spends its tribe's account too.
  it("reads each chancellor.answered line that spent tokens, beside the tribe checks', and skips the rest", () => {
    const answered = { tribe: 'codex', model: 'gpt-5.1-codex', matter: 'triage' };
    const checked = {
      tribe: 'gemini',
      model: 'gemini-3.8-flash-high',
      outcome: 'passed',
      checks: [],
      tokens: 900,
    };
    const events = [
      line('chancellor.answered', { ...answered, tokens: 61_204 }),
      line('tribe.checked', checked),
      line('chancellor.answered', { ...answered, matter: 'amendment', tokens: 0 }),
      line('chancellor.answered', { ...answered, matter: 'council', tokens: 5 }),
      line('chancellor.answered', { ...answered, matter: 'drafts', tokens: 12_000 }),
    ];
    const at = '2026-11-07T09:00:00+07:00';
    expect(outsideFromLog(events)).toEqual([
      { tribe: 'codex', model: 'gpt-5.1-codex', tokens: 61_204, at },
      { tribe: 'gemini', model: 'gemini-3.8-flash-high', tokens: 900, at },
      { tribe: 'codex', model: 'gpt-5.1-codex', tokens: 12_000, at },
    ]);
  });

  // PS-12d: the Monk's session of the Temple spends its tribe's account; a run that called no model spent nothing.
  it('reads each temple.ran line whose session spent tokens, and skips a run with no session', () => {
    const ran = { trigger: 'quests', day: '2026-11-07', groups: 2, operations: 1, letters: 0 };
    const events = [
      line('temple.ran', {
        ...ran,
        tribe: 'gemini',
        model: 'gemini-3.8-flash-low',
        tokens: 9_840,
        session: 's1',
      }),
      line('temple.ran', { ...ran, groups: 0, operations: 0 }),
      line('temple.ran', { ...ran, tribe: 'gemini', tokens: 300 }),
    ];
    expect(outsideFromLog(events)).toEqual([
      { tribe: 'gemini', model: 'gemini-3.8-flash-low', tokens: 9_840, at: '2026-11-07T09:00:00+07:00' },
    ]);
  });
});
