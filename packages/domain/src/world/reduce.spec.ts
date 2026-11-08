import { describe, expect, it } from 'vitest';

import { CharacterSchema } from '../schema/character/character.ts';
import { EventSchema } from '../schema/event/event.ts';
import {
  CAMPAIGNS,
  CHARACTER_VIEW,
  CHARACTERS,
  KINGDOM,
  QUEST_VIEW,
  QUESTS,
  TERRITORIES,
  TERRITORY_VIEW,
} from './__fixtures__/examples.ts';
import { characterViewOf } from './character-view.ts';
import { applyEvent, reduce } from './reduce.ts';
import { worldStateOf } from './world-state.ts';
import type { CharacterId } from '../core/ids.ts';
import type { Event } from '../schema/event/event.ts';

const STATE = worldStateOf({
  kingdom: KINGDOM,
  territories: TERRITORIES,
  characters: CHARACTERS,
  quests: QUESTS,
  campaigns: CAMPAIGNS,
});

let counter = 0;
/** A valid line; ids only need to be well formed here. */
function line(type: string, data: Record<string, unknown>): Event {
  counter += 1;
  return EventSchema.parse({
    v: 1,
    id: `01JCF8X4Z6Q3W9N2M5R7T8V${String(counter).padStart(3, '0')}`,
    ts: '2026-11-06T12:00:00+07:00',
    type,
    actor: { kind: 'steward' },
    data,
  });
}

const SABLE = 'sable' as CharacterId;
const THORN_IDLE = characterViewOf(
  CharacterSchema.parse({ ...CHARACTERS[0], status: 'idle', current: null }),
);

describe('applyEvent', () => {
  it('returns the same state for a line the world does not keep', () => {
    for (const ignored of [
      line('agent.tool', { tool: 'read', path: 'README.md' }),
      line('command.applied', { command_id: '01JCFB7Q2R8S4T6V9W3X5Y1Z0A' }),
      // The checks live in the Steward's memory, not in a file worldStateOf reads (P1-10b).
      line('check.start', {}),
      line('check.end', { outcome: 'pass', checks: [] }),
      line('verdict.pass', {}),
      line('mana.warning', {
        tribe: 'claude',
        pool: 'claude',
        window: 'weekly',
        used_pct: 90,
        source: 'estimate',
      }),
      line('mana.exhausted', { tribe: 'claude', pool: 'claude', model: 'fable' }),
      line('campaign.declared', { name: 'a type newer than this reader' }),
    ]) {
      expect(applyEvent(STATE, ignored)).toBe(STATE);
    }
  });

  it('puts the quest view of a quest line in place, with the characters it moved', () => {
    const view = { ...QUEST_VIEW, status: 'done', verifier: null } as const;
    const next = applyEvent(STATE, line('quest.done', { quest: view, characters: [THORN_IDLE] }));
    expect(next.quests[QUEST_VIEW.id]).toEqual(view);
    expect(next.characters[THORN_IDLE.id]).toEqual(THORN_IDLE);
    expect(next.characters[SABLE]).toBe(STATE.characters[SABLE]);
    expect(next.territories).toBe(STATE.territories);
  });

  it('adds a new quest, and keeps the characters when the line moved none', () => {
    const fresh = { ...QUEST_VIEW, id: 'q_20261106_zzzzzz', status: 'open', assignee: null, verifier: null };
    const next = applyEvent(STATE, line('quest.created', { quest: fresh }));
    expect(Object.keys(next.quests)).toHaveLength(Object.keys(STATE.quests).length + 1);
    expect(next.characters).toBe(STATE.characters);
  });

  it('drops an archived quest from the world; its file and its lines remain', () => {
    const archived = { ...QUEST_VIEW, status: 'archived', verifier: null } as const;
    const next = applyEvent(STATE, line('quest.archived', { quest: archived }));
    expect(next.quests[QUEST_VIEW.id]).toBeUndefined();
    expect(Object.keys(next.quests)).toHaveLength(Object.keys(STATE.quests).length - 1);
  });

  it("puts the owner's edit in place, and keeps the state for a notice that changes no quest", () => {
    const edited = { ...QUEST_VIEW, rank: 'B', title: 'A clearer title' } as const;
    expect(applyEvent(STATE, line('quest.edited', { quest: edited })).quests[QUEST_VIEW.id]).toEqual(edited);
    const notice = {
      reason: 'level_too_low',
      rank: 'A',
      class: 'knight',
      best_character: 'thorn',
      best_level: 5,
    };
    expect(applyEvent(STATE, line('quest.unclaimable', notice))).toBe(STATE);
  });

  it('applies the infirmary line like any quest line; its reason is for the chronicle', () => {
    const view = { ...QUEST_VIEW, status: 'infirmary', verifier: null } as const;
    const next = applyEvent(STATE, line('quest.infirmary', { reason: 'max_attempts', quest: view }));
    expect(next.quests[QUEST_VIEW.id]?.status).toBe('infirmary');
  });

  it.each([
    'character.created',
    'character.sleep',
    'character.wake',
    'character.meditate',
    'character.suspend',
    'character.release',
    'character.swamp',
    'character.level_up',
    'character.level_down',
    'character.model_changed',
  ])('puts the character view of %s in place', (type) => {
    const view = { ...CHARACTER_VIEW, id: 'nova' as CharacterId, name: 'Nova' };
    expect(applyEvent(STATE, line(type, { character: view })).characters[view.id]).toEqual(view);
  });

  it.each(['territory.attached', 'territory.surveyed', 'territory.health'])(
    'puts the territory view of %s in place',
    (type) => {
      const view = { ...TERRITORY_VIEW, health: { ci: 'red', open_bugs: 3, last_patrol_at: null } };
      expect(applyEvent(STATE, line(type, { territory: view })).territories[view.id]).toEqual(view);
    },
  );

  it('records a mana reading on its pool, at the time of the line', () => {
    const level = {
      tribe: 'gemini',
      pool: 'gemini_models',
      window: 'weekly',
      used_pct: 42,
      source: 'rate_limits',
    };
    const next = applyEvent(STATE, line('mana.level', level));
    expect(next.pools[1]?.readings).toEqual([
      {
        window: 'weekly',
        used_pct: 42,
        resets_at: null,
        source: 'rate_limits',
        observed_at: '2026-11-06T12:00:00+07:00',
      },
    ]);
    const resets = applyEvent(next, line('mana.level', { ...level, resets_at: '2026-11-07T12:00:00+07:00' }));
    expect(resets.pools[1]?.readings[0]?.resets_at).toBe('2026-11-07T12:00:00+07:00');
  });

  it('puts a whole pool to sleep and wakes it', () => {
    const pool = { tribe: 'claude', pool: 'claude' };
    const asleep = applyEvent(STATE, line('mana.exhausted', pool));
    expect(asleep.pools[0]?.asleep).toBe(true);
    expect(applyEvent(asleep, line('mana.restored', pool)).pools[0]?.asleep).toBe(false);
  });

  it('marks the state fake between the two lines of a sandbox replay', () => {
    const replaying = applyEvent(STATE, line('sandbox.replay.start', {}));
    expect(replaying.sandbox).toBe(true);
    expect(applyEvent(replaying, line('sandbox.replay.start', {}))).toBe(replaying);
    expect(applyEvent(replaying, line('sandbox.replay.end', {})).sandbox).toBe(false);
  });
});

describe('reduce', () => {
  it('is the state itself for no lines', () => {
    expect(reduce(STATE, [])).toBe(STATE);
  });

  it('applies lines in log order: the later view wins', () => {
    const working = { ...QUEST_VIEW, status: 'working', verifier: null } as const;
    const review = { ...QUEST_VIEW, status: 'review' } as const;
    const lines = [line('quest.started', { quest: working }), line('quest.submitted', { quest: review })];
    expect(reduce(STATE, lines).quests[QUEST_VIEW.id]?.status).toBe('review');
    expect(reduce(STATE, [...lines].reverse()).quests[QUEST_VIEW.id]?.status).toBe('working');
  });

  it('never changes the state it was given', () => {
    const before: unknown = JSON.parse(JSON.stringify(STATE));
    reduce(STATE, [line('mana.exhausted', { tribe: 'claude', pool: 'claude' })]);
    expect(STATE).toEqual(before);
  });
});
