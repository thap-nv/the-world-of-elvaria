import { describe, expect, it } from 'vitest';

import { CampaignSchema } from '../schema/campaign/campaign.ts';
import { KingdomSchema } from '../schema/kingdom.ts';
import { QuestSchema } from '../schema/quest/quest.ts';
import { CAMPAIGNS, CHARACTERS, KINGDOM, MEMOS, QUESTS, TERRITORIES } from './__fixtures__/examples.ts';
import { bannerOf } from './banner.ts';
import { characterViewOf } from './character-view.ts';
import { questViewOf } from './quest-view.ts';
import { WorldStateSchema, worldStateOf } from './world-state.ts';
import type { WorldSource } from './world-state.ts';

const SOURCE: WorldSource = {
  kingdom: KINGDOM,
  territories: TERRITORIES,
  characters: CHARACTERS,
  quests: QUESTS,
  campaigns: CAMPAIGNS,
};

describe('worldStateOf', () => {
  const state = worldStateOf(SOURCE);

  it('builds a state the schema accepts as it is', () => {
    expect(WorldStateSchema.parse(state)).toEqual(state);
  });

  it('carries the kingdom header and the thresholds the HUD marks on the mana bars', () => {
    expect(state.kingdom).toEqual({ name: 'Vương quốc Bình Minh', locale: 'vi', tz: 'Asia/Ho_Chi_Minh' });
    expect(state.mana).toEqual({ cap_pct: 98, king_reserve_pct: 2, warn_margin_pct: 10 });
    expect(state.sandbox).toBe(false);
  });

  it('holds the open memos only, and none without memo files (PS-03)', () => {
    expect(state.memos).toEqual({});
    expect(worldStateOf({ ...SOURCE, memos: MEMOS }).memos).toEqual({
      m_20261112_4k2pqz: {
        id: 'm_20261112_4k2pqz',
        kind: 'proposal',
        from: 'thorn',
        quest: 'q_20261112_7pzkfv',
        route: 'chancellor',
      },
    });
  });

  it('knows a CLI is ready once doctor found it, and missing before', () => {
    expect(state.tribes).toEqual([
      { id: 'claude', enabled: true, tool: 'ready' },
      { id: 'gemini', enabled: true, tool: 'ready' },
      { id: 'codex', enabled: false, tool: 'missing' },
    ]);
  });

  it('keys territories, characters and quests by id, one view each', () => {
    expect(Object.keys(state.territories)).toEqual(['dc1-se-team']);
    expect(state.characters).toEqual({
      thorn: characterViewOf(CHARACTERS[0]!),
      sable: characterViewOf(CHARACTERS[1]!),
    });
    expect(state.quests).toEqual(Object.fromEntries(QUESTS.map((quest) => [quest.id, questViewOf(quest)])));
  });

  it('leaves out an archived quest and a closed campaign: both have left the map', () => {
    const archived = QuestSchema.parse({ ...QUESTS[2], status: 'archived' });
    const closed = CampaignSchema.parse({
      ...CAMPAIGNS[0],
      status: 'closed',
      closed_at: '2026-11-20T18:00:00+07:00',
    });
    const without = worldStateOf({
      ...SOURCE,
      quests: [...QUESTS.slice(0, 2), archived],
      campaigns: [closed],
    });
    expect(Object.keys(without.quests)).toEqual(QUESTS.slice(0, 2).map(({ id }) => id));
    expect(without.campaigns).toEqual([]);
    expect(state.campaigns).toEqual([
      { id: 'c_20261110_5m8q2r', name: 'Phát hành v1.4', mode: 'offense', status: 'active' },
    ]);
  });

  it('takes mana as the Steward last read it, and the sandbox flag of a replay', () => {
    const pools = [{ tribe: KINGDOM.tribes[0]!.id, pool: 'claude', asleep: true, readings: [] }];
    const replay = worldStateOf({ ...SOURCE, pools, sandbox: true });
    expect(replay.pools).toEqual(pools);
    expect(replay.pools).not.toBe(pools);
    expect(replay.sandbox).toBe(true);
  });
});

describe('bannerOf over a world state', () => {
  it('reads the state as its source (implementation-plan §2.7)', () => {
    expect(bannerOf(worldStateOf(SOURCE))).toBeNull();
    expect(bannerOf(worldStateOf({ ...SOURCE, sandbox: true }))).toEqual({ kind: 'sandbox' });
    const [claude, ...others] = KINGDOM.tribes;
    const { tool: _found, ...notFound } = claude!;
    const kingdom = KingdomSchema.parse({ ...KINGDOM, tribes: [notFound, ...others] });
    expect(bannerOf(worldStateOf({ ...SOURCE, kingdom }))).toEqual({
      kind: 'tool_unavailable',
      tribes: [{ tribe: 'claude', tool: 'missing' }],
    });
  });
});
