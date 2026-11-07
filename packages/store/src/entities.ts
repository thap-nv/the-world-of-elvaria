// One row per kind of file a kingdom stores (implementation-plan §2.2, §2.3): its contract, zod schema,
// migrations and place. Reads, writes, listings and `migrateKingdom` are all driven by this table, so a new
// entity, or a new migration step, is one change here.
import {
  CampaignIdSchema,
  CampaignSchema,
  CharacterIdSchema,
  CharacterSchema,
  ClassesFileSchema,
  InboxCommandSchema,
  KindsFileSchema,
  KingdomSchema,
  QuestIdSchema,
  QuestSchema,
  RitualsFileSchema,
  ScriptsFileSchema,
  TagsFileSchema,
  TerritoryIdSchema,
  TerritorySchema,
  VerdictIdSchema,
  VerdictSchema,
} from '@elvaria/domain';
import { createRedactor } from '@elvaria/eventlog';
import type {
  Campaign,
  CampaignId,
  Character,
  CharacterId,
  InboxCommand,
  Kingdom,
  Quest,
  QuestId,
  RegistryFile,
  Territory,
  TerritoryId,
  Verdict,
  VerdictId,
} from '@elvaria/domain';

import { MIGRATIONS } from './migrations/index.ts';
import type { FileSpec, Parser } from './stored-file.ts';

/**
 * An entity stored one file per id: `<dir>/<id>.json`, or `<dir>/<id>/<nested>` when the entity also keeps
 * other files in its own folder (a territory's gazetteer, a character's scripture).
 */
export interface EntitySpec<T, Id extends string> extends FileSpec<T> {
  readonly idParser: Parser<Id>;
  readonly idOf: (value: T) => Id;
  readonly dir: string;
  readonly nested?: string;
}

/** Kingdom-relative path of the entity with this id. */
export const entityFile = (spec: { readonly dir: string; readonly nested?: string }, id: string): string =>
  spec.nested === undefined ? `${spec.dir}/${id}.json` : `${spec.dir}/${id}/${spec.nested}`;

export const KINGDOM_SPEC: FileSpec<Kingdom> = {
  contract: 'kingdom',
  parser: KingdomSchema,
  migrations: MIGRATIONS.kingdom,
};

/**
 * The five registry files, each against its own file schema. Loading a registry also runs the cross-file rules
 * (parseRegistry); a rewrite by `migrateKingdom` needs only each file to be valid on its own.
 */
export const REGISTRY_SPECS: Readonly<Record<RegistryFile, FileSpec<unknown>>> = {
  kinds: { contract: 'kind', parser: KindsFileSchema, migrations: MIGRATIONS.kind },
  classes: { contract: 'class', parser: ClassesFileSchema, migrations: MIGRATIONS.class },
  rituals: { contract: 'ritual', parser: RitualsFileSchema, migrations: MIGRATIONS.ritual },
  scripts: { contract: 'script', parser: ScriptsFileSchema, migrations: MIGRATIONS.script },
  tags: { contract: 'tag', parser: TagsFileSchema, migrations: MIGRATIONS.tag },
};

export const INBOX_SPEC: FileSpec<InboxCommand> = {
  contract: 'inbox-command',
  parser: InboxCommandSchema,
  migrations: MIGRATIONS['inbox-command'],
};

export const TERRITORY_SPEC: EntitySpec<Territory, TerritoryId> = {
  contract: 'territory',
  parser: TerritorySchema,
  migrations: MIGRATIONS.territory,
  idParser: TerritoryIdSchema,
  idOf: (territory) => territory.id,
  dir: 'territories',
  nested: 'territory.json',
};

export const QUEST_SPEC: EntitySpec<Quest, QuestId> = {
  contract: 'quest',
  parser: QuestSchema,
  migrations: MIGRATIONS.quest,
  idParser: QuestIdSchema,
  idOf: (quest) => quest.id,
  dir: 'quests',
};

export const CHARACTER_SPEC: EntitySpec<Character, CharacterId> = {
  contract: 'character',
  parser: CharacterSchema,
  migrations: MIGRATIONS.character,
  idParser: CharacterIdSchema,
  idOf: (character) => character.id,
  dir: 'characters',
  nested: 'character.json',
};

export const CAMPAIGN_SPEC: EntitySpec<Campaign, CampaignId> = {
  contract: 'campaign',
  parser: CampaignSchema,
  migrations: MIGRATIONS.campaign,
  idParser: CampaignIdSchema,
  idOf: (campaign) => campaign.id,
  dir: 'campaigns',
};

/** The patterns only: the store does not know a session's secret values (the Steward masks those first). */
const maskPatterns = createRedactor([]);

/**
 * Verdicts are records: the Steward writes one per attempt and never edits it. Their notes are free text a
 * verifier wrote and the next prompt reads, so every write masks secret shapes in them (ADR 0013).
 */
export const VERDICT_SPEC: EntitySpec<Verdict, VerdictId> = {
  contract: 'verdict',
  parser: VerdictSchema,
  migrations: MIGRATIONS.verdict,
  idParser: VerdictIdSchema,
  idOf: (verdict) => verdict.id,
  dir: 'verdicts',
  scrub: (verdict) =>
    verdict.notes === undefined ? verdict : { ...verdict, notes: maskPatterns(verdict.notes) },
};
