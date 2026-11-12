// The kingdom as one object to inject: the Steward gets a `KingdomStore` (implementation-plan §3.1), tests
// get one on a temp folder, and nothing else needs to know the file names.
import path from 'node:path';

import type {
  Campaign,
  CampaignId,
  Character,
  CharacterId,
  Kingdom,
  Memo,
  MemoId,
  Quest,
  QuestId,
  Registry,
  Result,
  Territory,
  TerritoryId,
  Verdict,
  VerdictId,
} from '@elvaria/domain';

import {
  CAMPAIGN_SPEC,
  CHARACTER_SPEC,
  KINGDOM_SPEC,
  MEMO_SPEC,
  QUEST_SPEC,
  TERRITORY_SPEC,
  VERDICT_SPEC,
} from './entities.ts';
import { entityStore, fileStore } from './entity-store.ts';
import { inboxStore } from './inbox.ts';
import { KINGDOM_FILE } from './layout.ts';
import { loadRegistry } from './registry.ts';
import type { EntityStore, FileStore } from './entity-store.ts';
import type { InboxStore } from './inbox.ts';
import type { RegistryLoadIssue } from './registry.ts';

export interface KingdomStore {
  /** Absolute path of the kingdom folder. */
  readonly root: string;
  readonly kingdom: FileStore<Kingdom>;
  readonly territories: EntityStore<Territory, TerritoryId>;
  readonly quests: EntityStore<Quest, QuestId>;
  readonly characters: EntityStore<Character, CharacterId>;
  readonly campaigns: EntityStore<Campaign, CampaignId>;
  readonly verdicts: EntityStore<Verdict, VerdictId>;
  readonly memos: EntityStore<Memo, MemoId>;
  readonly inbox: InboxStore;
  loadRegistry(): Promise<Result<Registry, readonly RegistryLoadIssue[]>>;
}

/** Opens the kingdom at `dir` (nothing is read until asked). */
export function openKingdom(dir: string): KingdomStore {
  const root = path.resolve(dir);
  return {
    root,
    kingdom: fileStore(root, KINGDOM_SPEC, KINGDOM_FILE),
    territories: entityStore(root, TERRITORY_SPEC),
    quests: entityStore(root, QUEST_SPEC),
    characters: entityStore(root, CHARACTER_SPEC),
    campaigns: entityStore(root, CAMPAIGN_SPEC),
    verdicts: entityStore(root, VERDICT_SPEC),
    memos: entityStore(root, MEMO_SPEC),
    inbox: inboxStore(root),
    loadRegistry: () => loadRegistry(root),
  };
}
