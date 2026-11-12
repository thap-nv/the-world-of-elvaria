// The world state (implementation-plan §2.7, §8 P0-09): everything the world and the lite client draw, as plain
// JSON so the herald can send it over the WebSocket and keep it as a snapshot in .state/. It is built two ways
// that must agree: from the kingdom files (worldStateOf) and from the event log (reduce). The world layer
// never reads the files itself (ADR 0001); the herald does, and sends this.
import { z } from 'zod';

import {
  CampaignIdSchema,
  CharacterIdSchema,
  MemoIdSchema,
  QuestIdSchema,
  TerritoryIdSchema,
  TribeIdSchema,
} from '../core/ids.ts';
import { NameSchema } from '../schema/common.ts';
import { TOOL_STATES } from './banner.ts';
import { CharacterViewSchema, characterViewOf } from './character-view.ts';
import { PoolViewSchema, poolsOf } from './mana-view.ts';
import { MemoViewSchema, memoViewOf } from './memo-view.ts';
import { QuestViewSchema, questViewOf } from './quest-view.ts';
import { TerritoryViewSchema, territoryViewOf } from './territory-view.ts';
import type { Campaign } from '../schema/campaign/campaign.ts';
import type { Character } from '../schema/character/character.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Memo } from '../schema/memo/memo.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Territory } from '../schema/territory.ts';
import type { Tribe } from '../schema/tribe.ts';
import type { ToolState } from './banner.ts';
import type { PoolView } from './mana-view.ts';

export const TribeViewSchema = z.strictObject({
  id: TribeIdSchema,
  enabled: z.boolean(),
  tool: z.enum(TOOL_STATES),
});

// The enums repeat campaign.json's; campaignViewOf assigns one to the other, so tsc fails if they part.
export const CampaignViewSchema = z.strictObject({
  id: CampaignIdSchema,
  name: z.string().min(1),
  mode: z.enum(['offense', 'defense']),
  status: z.enum(['declared', 'active', 'won', 'lost', 'retro_pending']),
});

export const WorldStateSchema = z.strictObject({
  kingdom: z.strictObject({ name: NameSchema, locale: z.enum(['vi', 'en']), tz: z.string().min(1) }),
  /** The thresholds the HUD marks on every mana bar (`.elv-mana__cap`, `.elv-mana__warn`). */
  mana: z.strictObject({
    cap_pct: z.number().min(0).max(100),
    king_reserve_pct: z.number().min(0).max(100),
    warn_margin_pct: z.number().min(0).max(100),
  }),
  /** A sandbox day is on screen: everything is fake and the HUD says so (bannerOf). */
  sandbox: z.boolean(),
  tribes: z.array(TribeViewSchema),
  pools: z.array(PoolViewSchema),
  campaigns: z.array(CampaignViewSchema),
  territories: z.record(TerritoryIdSchema, TerritoryViewSchema),
  characters: z.record(CharacterIdSchema, CharacterViewSchema),
  quests: z.record(QuestIdSchema, QuestViewSchema),
  /** Open memos (PS-03): what the attention queue lists for the owner to decide. */
  memos: z.record(MemoIdSchema, MemoViewSchema),
});

export type TribeView = z.infer<typeof TribeViewSchema>;
export type CampaignView = z.infer<typeof CampaignViewSchema>;
export type WorldState = z.infer<typeof WorldStateSchema>;

/** What worldStateOf reads: the kingdom files, as the store loads them. */
export interface WorldSource {
  readonly kingdom: Kingdom;
  readonly territories: readonly Territory[];
  readonly characters: readonly Character[];
  readonly quests: readonly Quest[];
  readonly campaigns: readonly Campaign[];
  /** memos/*.json (PS-03); without them the world has no memo. */
  readonly memos?: readonly Memo[];
  /** Mana as the Steward last read it (P1-05); without it every enabled pool is awake with no reading. */
  readonly pools?: readonly PoolView[];
  readonly sandbox?: boolean;
}

/**
 * kingdom.json knows whether the CLI was found (`elvaria doctor` writes `tool`), not whether its login still
 * works: `logged_out` comes only from a later reading.
 */
const toolOf = (tribe: Tribe): ToolState => (tribe.tool === undefined ? 'missing' : 'ready');

const tribeViewOf = (tribe: Tribe): TribeView => ({
  id: tribe.id,
  enabled: tribe.enabled,
  tool: toolOf(tribe),
});

/** A closed campaign has left the map, like an archived quest (reduce.ts drops both the same way). */
const campaignViewOf = (campaign: Campaign): CampaignView[] =>
  campaign.status === 'closed'
    ? []
    : [{ id: campaign.id, name: campaign.name, mode: campaign.mode, status: campaign.status }];

const byId = <T extends { readonly id: string }>(items: readonly T[]): Record<T['id'], T> =>
  // fromEntries widens the keys to string; every key is the item's own id.
  Object.fromEntries(items.map((item) => [item.id, item])) as Record<T['id'], T>;

/** The world as the kingdom files describe it: what the herald sends first, and what the log must rebuild. */
export function worldStateOf(source: WorldSource): WorldState {
  const { kingdom } = source;
  const { cap_pct, king_reserve_pct, warn_margin_pct } = kingdom.mana;
  return {
    kingdom: { name: kingdom.name, locale: kingdom.owner.locale, tz: kingdom.tz },
    mana: { cap_pct, king_reserve_pct, warn_margin_pct },
    sandbox: source.sandbox ?? false,
    tribes: kingdom.tribes.map(tribeViewOf),
    pools: [...(source.pools ?? poolsOf(kingdom.tribes))],
    campaigns: source.campaigns.flatMap(campaignViewOf),
    territories: byId(source.territories.map(territoryViewOf)),
    characters: byId(source.characters.map(characterViewOf)),
    // An archived quest has left the world; its file and its events remain (reduce.ts drops it the same way).
    quests: byId(source.quests.filter(({ status }) => status !== 'archived').map(questViewOf)),
    // A closed memo has left the world, as an archived quest has (reduce.ts drops it the same way).
    memos: byId((source.memos ?? []).filter(({ state }) => state === 'open').map(memoViewOf)),
  };
}
