// scopeState and scopeEvents line by line (W6, ADR 0037): what a device given `home` keeps, what it loses, what it
// sees cleared, and when the Herald must follow the lines with a snapshot.
import { describe, expect, it } from 'vitest';

import {
  AWAY,
  HOME,
  M_AWAY,
  M_HOME,
  M_LATER,
  M_LOOSE,
  Q_AWAY,
  Q_HOME,
  Q_LATER,
  SABLE,
  THORN,
  WORLD,
  line,
  questLine,
} from './__fixtures__/world.ts';
import { scopeEvents } from './scope-events.ts';
import { scopeState } from './scope-state.ts';
import type { Event } from '../schema/event/event.ts';
import type { WorldState } from '../world/world-state.ts';

const ONLY_HOME = [HOME];
const IDLE_SABLE = { ...SABLE, status: 'idle', current: null } as const;
const READING = { tribe: 'claude', window: 'five_hour', used_pct: 40, resets_at: null, source: 'statusline' };

/** What the device is sent for `lines` read after `state`: the lines kept, by type, and the resync. */
const sent = (lines: readonly Event[], state: WorldState = WORLD) => {
  const scoped = scopeEvents(lines, state, ONLY_HOME);
  return { kept: scoped.events, resync: scoped.resync };
};

describe('scopeState', () => {
  it('keeps the territory given, its quest and its memo, and every character with what it holds there', () => {
    const scoped = scopeState(WORLD, ONLY_HOME);
    expect(Object.keys(scoped.territories)).toEqual([HOME]);
    expect(Object.keys(scoped.quests)).toEqual([Q_HOME.id]);
    expect(Object.keys(scoped.memos)).toEqual([M_HOME.id]);
    expect(scoped.characters).toEqual({ [THORN.id]: THORN, [SABLE.id]: { ...SABLE, current: null } });
  });

  it('keeps what the whole kingdom shares and drops its campaigns', () => {
    const scoped = scopeState(WORLD, ONLY_HOME);
    expect(WORLD.campaigns.length).toBeGreaterThan(0);
    expect(scoped.campaigns).toEqual([]);
    expect([scoped.kingdom, scoped.mana, scoped.pools, scoped.tribes, scoped.sandbox]).toEqual([
      WORLD.kingdom,
      WORLD.mana,
      WORLD.pools,
      WORLD.tribes,
      WORLD.sandbox,
    ]);
  });

  it('drops a memo of no quest, and one of a quest the state does not hold', () => {
    const state = { ...WORLD, memos: { ...WORLD.memos, [M_LATER.id]: M_LATER } };
    expect(Object.keys(scopeState(state, [HOME, AWAY]).memos)).toEqual([M_HOME.id, M_AWAY.id]);
    expect(M_LOOSE.quest).toBeNull();
  });
});

describe('scopeEvents: quest lines', () => {
  it('sends a line of a quest at home as it is', () => {
    const claimed = questLine('quest.claimed', Q_HOME, [THORN]);
    expect(sent([claimed])).toEqual({ kept: [claimed], resync: false });
  });

  it('clears, in a line it sends, the quest a character holds away', () => {
    const { kept } = sent([questLine('quest.verdict', Q_HOME, [THORN, SABLE])]);
    expect(kept[0]?.data.characters).toEqual([THORN, { ...SABLE, current: null }]);
  });

  it('drops a line of a quest away, and resyncs only when it moved a character the device sees', () => {
    expect(sent([questLine('quest.edited', Q_AWAY)])).toEqual({ kept: [], resync: false });
    expect(sent([questLine('quest.started', Q_AWAY, [SABLE])])).toEqual({ kept: [], resync: false });
    expect(sent([questLine('quest.done', Q_AWAY, [IDLE_SABLE])])).toEqual({ kept: [], resync: true });
    const stranger = { ...SABLE, id: 'wren', name: 'Wren' } as unknown as typeof SABLE;
    expect(sent([questLine('quest.claimed', Q_AWAY, [stranger])]).resync).toBe(true);
  });

  it('resyncs when a quest at home leaves the state while a memo or another character still points at it', () => {
    const archived = { ...Q_HOME, status: 'archived' } as const;
    const released = { ...THORN, status: 'idle', current: null } as const;
    expect(sent([questLine('quest.archived', archived, [released])]).resync).toBe(true);
    const noMemo = { ...WORLD, memos: {} };
    expect(sent([questLine('quest.archived', archived, [released])], noMemo).resync).toBe(false);
    expect(sent([questLine('quest.archived', archived)], noMemo).resync).toBe(true);
  });

  it('resyncs when a quest at home enters the state that a memo already named', () => {
    const later = { ...Q_HOME, id: Q_LATER, status: 'open' } as const;
    const withMemo = { ...WORLD, memos: { ...WORLD.memos, [M_LATER.id]: M_LATER } };
    expect(sent([questLine('quest.created', later)], withMemo)).toMatchObject({ resync: true });
    expect(sent([questLine('quest.created', later)])).toMatchObject({ resync: false });
  });
});

describe('scopeEvents: other lines', () => {
  it('sends a character line of no quest, the quest away cleared, and drops one placed away', () => {
    const asleep = { ...SABLE, status: 'sleeping_mana' } as const;
    expect(sent([line('character.sleep', { character: asleep })]).kept[0]?.data.character).toEqual({
      ...asleep,
      current: null,
    });
    const atHome = line('character.wake', { character: THORN }, { quest: Q_HOME.id });
    expect(sent([atHome])).toEqual({ kept: [atHome], resync: false });
    expect(sent([line('character.sleep', { character: asleep }, { quest: Q_AWAY.id })])).toEqual({
      kept: [],
      resync: true,
    });
    expect(sent([line('character.judged', { character: SABLE }, { quest: Q_AWAY.id })]).resync).toBe(false);
  });

  it('sends a territory line of the territory given only', () => {
    const home = line('territory.surveyed', { territory: WORLD.territories[HOME] });
    const away = line('territory.surveyed', { territory: WORLD.territories[AWAY] });
    expect(sent([home, away])).toEqual({ kept: [home], resync: false });
  });

  it('sends a memo line when its memo goes with a quest at home', () => {
    const filedHome = line(
      'memo.filed',
      { memo: 'm_20261106_eeeeee', kind: 'proposal' },
      { quest: Q_HOME.id },
    );
    const filedAway = line(
      'memo.filed',
      { memo: 'm_20261106_ffffff', kind: 'proposal' },
      { quest: Q_AWAY.id },
    );
    const filedLoose = line('memo.filed', { memo: 'm_20261106_gggggg', kind: 'proposal' });
    const routedHome = line('memo.routed', { memo: M_HOME.id, route: 'chancellor' });
    const routedAway = line('memo.routed', { memo: M_AWAY.id, route: 'chancellor' });
    const closedUnknown = line('memo.closed', { memo: 'm_20261106_hhhhhh', decision: 'shelved' });
    expect(sent([filedHome, filedAway, filedLoose, routedHome, routedAway, closedUnknown])).toEqual({
      kept: [filedHome, routedHome],
      resync: false,
    });
  });

  it('sends mana and sandbox lines of the whole kingdom, and resyncs for a reading placed away', () => {
    const reading = line('mana.level', READING);
    const replay = line('sandbox.replay.start', {});
    expect(sent([reading, replay])).toEqual({ kept: [reading, replay], resync: false });
    expect(sent([line('mana.level', READING, { quest: Q_AWAY.id })])).toEqual({ kept: [], resync: true });
    expect(sent([line('mana.signal', { tribe: 'claude' }, { quest: Q_AWAY.id })])).toEqual({
      kept: [],
      resync: false,
    });
  });

  it('sends any other line of a known type placed at home, and nothing placed elsewhere or nowhere', () => {
    const toolHome = line('agent.tool', { tool: 'read' }, { quest: Q_HOME.id, territory: HOME });
    const toolAway = line('agent.tool', { tool: 'read' }, { quest: Q_HOME.id, territory: AWAY });
    const toolUnknown = line('agent.tool', { tool: 'read' }, { quest: Q_LATER });
    const territoryAway = line('patrol.ran', {}, { territory: AWAY });
    const answered = line('command.applied', { command_id: '01M6QC00000000000000000000' });
    const unknownAtHome = line('battle.won', {}, { quest: Q_HOME.id });
    expect(sent([toolHome, toolAway, toolUnknown, territoryAway, answered, unknownAtHome])).toEqual({
      kept: [toolHome],
      resync: false,
    });
  });
});
