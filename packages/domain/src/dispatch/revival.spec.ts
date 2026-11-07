import { describe, expect, it } from 'vitest';

import { Q1, at, moved, quest, workingBy } from './__fixtures__/snapshot.ts';
import { answeredAlready, resumedSession } from './revival.ts';
import type { Instant } from '../core/clock.ts';

const POLICY = { resume_after_mana: false, resume_after_answer_minutes: 55 };
/** Thorn asked at minute 20, its session `s-ask` ending with the question. */
const BLOCKED = moved(workingBy(quest(Q1), 'thorn', 10), 20, [
  'ask',
  'runner',
  { question: 'Which database?', session_id: 's-ask' },
]);
const PAUSED = moved(workingBy(quest(Q1), 'thorn', 10), 20, ['mana_out', 'mana', { session_id: 's-mana' }]);
const answerAt = (minute: number) => ({ kind: 'answer', now: Date.parse(at(minute)) as Instant }) as const;

describe('resumedSession after an answer', () => {
  it('continues the asking session for an answer within the minutes, a fresh one after', () => {
    expect(resumedSession(BLOCKED, answerAt(20 + 54), POLICY, true)).toBe('s-ask');
    expect(resumedSession(BLOCKED, answerAt(20 + 55), POLICY, true)).toBe('s-ask');
    expect(resumedSession(BLOCKED, answerAt(20 + 56), POLICY, true)).toBeNull();
  });

  it('starts fresh when the adapter cannot resume or the owner turned it off', () => {
    expect(resumedSession(BLOCKED, answerAt(21), POLICY, false)).toBeNull();
    const off = { ...POLICY, resume_after_answer_minutes: null };
    expect(resumedSession(BLOCKED, answerAt(21), off, true)).toBeNull();
  });

  it('starts fresh when no asking session is on record', () => {
    expect(resumedSession(PAUSED, answerAt(21), POLICY, true)).toBeNull();
    const unnamed = moved(workingBy(quest(Q1), 'thorn', 10), 20, ['ask', 'runner', { question: 'Why?' }]);
    expect(resumedSession(unnamed, answerAt(21), POLICY, true)).toBeNull();
    const broken = { ...BLOCKED, blocked: { question: 'Why?', asked_at: 'not a time' } };
    expect(resumedSession(broken, answerAt(21), POLICY, true)).toBeNull();
  });
});

describe('resumedSession after mana', () => {
  it('starts fresh from the letter unless resume_after_mana is on (principle 13)', () => {
    expect(resumedSession(PAUSED, { kind: 'mana' }, POLICY, true)).toBeNull();
    const on = { ...POLICY, resume_after_mana: true };
    expect(resumedSession(PAUSED, { kind: 'mana' }, on, true)).toBe('s-mana');
    expect(resumedSession(PAUSED, { kind: 'mana' }, on, false)).toBeNull();
    expect(resumedSession(BLOCKED, { kind: 'mana' }, on, true)).toBeNull();
    expect(resumedSession(quest(Q1), { kind: 'mana' }, on, true)).toBeNull();
  });
});

describe('answeredAlready', () => {
  it('knows the question the owner answered, whitespace aside', () => {
    const answered = { blocked: { question: 'Which database?', asked_at: at(20), answer: 'Postgres' } };
    expect(answeredAlready(answered, '  Which database?\n')).toBe(true);
    expect(answeredAlready(answered, 'Which port?')).toBe(false);
    expect(
      answeredAlready({ blocked: { question: 'Which database?', asked_at: at(20) } }, 'Which database?'),
    ).toBe(false);
    expect(answeredAlready({}, 'Which database?')).toBe(false);
  });
});
