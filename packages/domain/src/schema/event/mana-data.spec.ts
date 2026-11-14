// Two optional fields P1-32 added to the mana lines, `v` still 1: the reset a sleep waits for, and the readings of
// one model's own cap. Lines written before them, without either, still parse.
import { describe, expect, it } from 'vitest';

import { EVENT_VERSION, EventSchema } from './event.ts';

const line = (type: string, data: Record<string, unknown>) => ({
  v: EVENT_VERSION,
  id: '01M6RQ5Y00000000000000033A',
  ts: '2026-11-09T09:00:00+07:00',
  type,
  actor: { kind: 'steward' },
  data,
});

const issuesOf = (value: unknown): string[] => {
  const result = EventSchema.safeParse(value);
  return result.success
    ? []
    : result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
};

const ARGON = { tribe: 'gemini', pool: 'gemini_models', model: 'argon' };
const RESETS = '2026-11-12T09:00:00+07:00';
const WEEKLY = { window: 'weekly', used_pct: 93, source: 'rate_limits' };

describe('mana lines since P1-32', () => {
  it.each([
    ['mana.exhausted', { ...ARGON, resets_at: RESETS }],
    ['mana.exhausted', ARGON],
    ['mana.level', { ...ARGON, ...WEEKLY, resets_at: RESETS }],
    ['mana.level', { tribe: 'claude', pool: 'claude', ...WEEKLY }],
  ])('accepts %s %j', (type, data) => {
    expect(issuesOf(line(type, data))).toEqual([]);
  });

  it.each([
    ['mana.exhausted', { ...ARGON, resets_at: 'after lunch' }, 'data.resets_at'],
    // A gauge wakes when its probe finds mana, not at a time it names.
    ['mana.restored', { ...ARGON, resets_at: RESETS }, 'Unrecognized key: "resets_at"'],
    ['mana.level', { ...ARGON, ...WEEKLY, model: 'Argon' }, 'data.model'],
  ])('rejects %s %j', (type, data, expected) => {
    expect(issuesOf(line(type, data)).join('\n')).toContain(expected);
  });
});
