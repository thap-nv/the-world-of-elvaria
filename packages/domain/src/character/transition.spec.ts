import { describe, expect, it } from 'vitest';

import examples from '../../examples/character.json' with { type: 'json' };
import { CHARACTER_STATUSES, CharacterSchema } from '../schema/character/character.ts';
import { transitionCharacter } from './transition.ts';
import { CHARACTER_EVENT_TYPES, CHARACTER_TRANSITIONS } from './transitions.ts';
import type { QuestId } from '../core/ids.ts';
import type { Character, CharacterStatus } from '../schema/character/character.ts';
import type { CharacterEvent } from './transition.ts';
import type { CharacterEventType } from './transitions.ts';

const QUEST = 'q_20261106_7k3m2a' as QuestId;
const at = (m: number) => `2026-11-06T10:${String(m).padStart(2, '0')}:00+07:00`;

const IDLE = CharacterSchema.parse({
  ...examples[0],
  status: 'idle',
  status_since: at(0),
  current: null,
});

// claim and assign_verify carry the quest; the other events ignore it.
const eventOf = (type: CharacterEventType, m: number): CharacterEvent => ({ type, at: at(m), quest: QUEST });

function walk(character: Character, types: readonly CharacterEventType[]): Character {
  return types.reduce((current, type, index) => {
    const result = transitionCharacter(current, eventOf(type, index + 1));
    if (!result.ok) throw new Error(`${current.status} -> ${type}: ${JSON.stringify(result.error)}`);
    return result.value;
  }, character);
}

/** One character per status, reached from idle; sleeping_mana twice, over a paused quest and idle. */
const SAMPLES: readonly Character[] = [
  IDLE,
  walk(IDLE, ['claim']),
  walk(IDLE, ['assign_verify']),
  walk(IDLE, ['claim', 'compact_start']),
  walk(IDLE, ['claim', 'breaker']),
  walk(IDLE, ['claim', 'mana_out']),
  walk(IDLE, ['mana_out']),
  walk(IDLE, ['suspend']),
];

const rowsFor = (status: CharacterStatus, type: CharacterEventType) =>
  CHARACTER_TRANSITIONS.filter((row) => row.from.includes(status) && row.events.includes(type));

describe('the character state machine', () => {
  it('reaches every status from idle', () => {
    expect(new Set(SAMPLES.map(({ status }) => status))).toEqual(new Set(CHARACTER_STATUSES));
  });

  it('has one row at most for each status and event', () => {
    for (const status of CHARACTER_STATUSES) {
      for (const type of CHARACTER_EVENT_TYPES) expect(rowsFor(status, type).length).toBeLessThanOrEqual(1);
    }
  });

  it('takes exactly the events its table lists, into the status the row names', () => {
    for (const character of SAMPLES) {
      for (const type of CHARACTER_EVENT_TYPES) {
        const [row] = rowsFor(character.status, type);
        const result = transitionCharacter(character, eventOf(type, 30));
        if (row === undefined) {
          expect(result).toEqual({
            ok: false,
            error: { code: 'no_transition', from: character.status, event: type },
          });
          continue;
        }
        const to = row.to === 'before_sleep' ? character.status_before_sleep : row.to;
        expect(result).toMatchObject({ ok: true, value: { status: to } });
      }
    }
  });

  it('holds the quest it takes, as assignee or as verifier', () => {
    expect(walk(IDLE, ['claim']).current).toEqual({ quest: QUEST, role: 'assignee' });
    expect(walk(IDLE, ['assign_verify']).current).toEqual({ quest: QUEST, role: 'verifier' });
    expect(walk(IDLE, ['claim', 'compact_start', 'compact_end'])).toMatchObject({
      status: 'working',
      current: { role: 'assignee' },
    });
    expect(walk(IDLE, ['claim', 'submit'])).toMatchObject({
      status: 'idle',
      current: null,
      status_since: at(2),
    });
  });

  it('sleeps over a paused quest and wakes into it', () => {
    const asleep = walk(IDLE, ['claim', 'compact_start', 'mana_out']);
    expect(asleep).toMatchObject({
      status: 'sleeping_mana',
      status_before_sleep: 'working',
      current: { quest: QUEST, role: 'assignee' },
    });
    const awake = walk(asleep, ['mana_restored']);
    expect(awake).toMatchObject({ status: 'working', current: { quest: QUEST } });
    expect(awake).not.toHaveProperty('status_before_sleep');
  });

  it('wakes idle when its review or its quest was given away while it slept', () => {
    const verifier = walk(IDLE, ['assign_verify', 'mana_out']);
    expect(verifier).toMatchObject({ status_before_sleep: 'idle', current: null });
    expect(walk(verifier, ['mana_restored'])).toMatchObject({ status: 'idle', current: null });
    const asleep = walk(IDLE, ['claim', 'mana_out']);
    const unassigned = walk(asleep, ['unassign']);
    // Still asleep since the same moment: only the quest changed.
    expect(unassigned).toMatchObject({ status_before_sleep: 'idle', current: null, status_since: at(2) });
  });

  it('keeps its quest in the swamp and drops it once the quest reaches the infirmary', () => {
    const swamp = walk(IDLE, ['claim', 'breaker']);
    expect(swamp.current).toEqual({ quest: QUEST, role: 'assignee' });
    expect(walk(swamp, ['quest_infirmary'])).toMatchObject({ status: 'idle', current: null });
    // The schema lets a meditating character omit current; it reaches the swamp holding nothing.
    const { current: _, ...meditating } = walk(IDLE, ['claim', 'compact_start']);
    expect(walk(meditating, ['breaker'])).toMatchObject({ status: 'swamp', current: null });
  });

  it('goes to the temple from any status the owner suspends it in, and comes back idle', () => {
    for (const character of SAMPLES.filter(({ status }) => status !== 'suspended')) {
      const suspended = walk(character, ['suspend']);
      expect(suspended).toMatchObject({ status: 'suspended', current: null });
      expect(suspended).not.toHaveProperty('status_before_sleep');
    }
    expect(walk(IDLE, ['fail_streak', 'temple_done']).status).toBe('idle');
    expect(walk(IDLE, ['send_to_temple', 'release']).status).toBe('idle');
  });

  it('ends the fail streak when the character leaves the temple, and only then (P1-04)', () => {
    const streak = { ...IDLE, consecutive_fail: { fail_kind: 'style' as const, count: 3 } };
    const suspended = walk(streak, ['fail_streak']);
    expect(suspended.consecutive_fail).toEqual({ fail_kind: 'style', count: 3 });
    expect(walk(suspended, ['temple_done']).consecutive_fail).toEqual({ count: 0 });
    expect(walk(suspended, ['release']).consecutive_fail).toEqual({ count: 0 });
  });

  it('wakes a verifier of an older file into its review, and a character that lost its memory idle', () => {
    const legacy = {
      ...walk(IDLE, ['assign_verify']),
      status: 'sleeping_mana',
      status_before_sleep: 'reviewing',
    };
    expect(transitionCharacter(legacy as Character, eventOf('mana_restored', 9))).toMatchObject({
      ok: true,
      value: { status: 'reviewing', current: { role: 'verifier' } },
    });
    const { status_before_sleep: _, ...lost } = walk(IDLE, ['mana_out']);
    expect(transitionCharacter(lost as Character, eventOf('mana_restored', 9))).toMatchObject({
      ok: true,
      value: { status: 'idle' },
    });
  });

  it('refuses a result the character schema rejects, such as a time without an offset', () => {
    const result = transitionCharacter(IDLE, { type: 'claim', at: 'yesterday', quest: QUEST });
    expect(result).toMatchObject({ ok: false, error: { code: 'invalid_result' } });
    expect(result.ok ? [] : result.error).toMatchObject({
      issues: [expect.stringMatching(/^status_since: /)],
    });
  });
});
