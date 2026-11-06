// Every data contract that has a file in docs/schemas/ (implementation-plan §2.3), by file name. `pnpm schemas`
// writes docs/schemas/<name>.schema.json from these zod sources (ADR 0003); adding a contract is one line here.
import { CampaignSchema } from './campaign/campaign.ts';
import { CharacterSchema } from './character/character.ts';
import { InboxCommandSchema } from './command/inbox-command.ts';
import { EventSchema } from './event/event.ts';
import { KingdomSchema } from './kingdom.ts';
import { LessonSchema } from './lesson/lesson.ts';
import { QuestDraftFileSchema } from './quest/quest-draft.ts';
import { QuestSchema } from './quest/quest.ts';
import { VerdictSchema } from './quest/verdict.ts';
import {
  ClassesFileSchema,
  KindsFileSchema,
  RitualsFileSchema,
  ScriptsFileSchema,
  TagsFileSchema,
} from './registry-entries.ts';
import { SkillSchema } from './skill/skill.ts';
import { TerritorySchema } from './territory.ts';
import { WorldMapSchema } from './world-map/world-map.ts';
import type { z } from 'zod';

export const CONTRACTS = {
  kingdom: KingdomSchema,
  territory: TerritorySchema,
  quest: QuestSchema,
  character: CharacterSchema,
  campaign: CampaignSchema,
  verdict: VerdictSchema,
  lesson: LessonSchema,
  event: EventSchema,
  'inbox-command': InboxCommandSchema,
  kind: KindsFileSchema,
  class: ClassesFileSchema,
  ritual: RitualsFileSchema,
  script: ScriptsFileSchema,
  tag: TagsFileSchema,
  skill: SkillSchema,
  'quest-draft': QuestDraftFileSchema,
  'world-map': WorldMapSchema,
} as const satisfies Record<string, z.ZodType>;

export type ContractName = keyof typeof CONTRACTS;
