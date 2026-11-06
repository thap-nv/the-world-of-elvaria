// The v1 examples of docs/schemas, parsed: the files the world-state specs start from.
import campaignExamples from '../../../examples/campaign.json' with { type: 'json' };
import characterExamples from '../../../examples/character.json' with { type: 'json' };
import kingdomExamples from '../../../examples/kingdom.json' with { type: 'json' };
import questExamples from '../../../examples/quest.json' with { type: 'json' };
import territoryExamples from '../../../examples/territory.json' with { type: 'json' };
import { CampaignSchema } from '../../schema/campaign/campaign.ts';
import { CharacterSchema } from '../../schema/character/character.ts';
import { KingdomSchema } from '../../schema/kingdom.ts';
import { QuestSchema } from '../../schema/quest/quest.ts';
import { TerritorySchema } from '../../schema/territory.ts';
import { characterViewOf } from '../character-view.ts';
import { questViewOf } from '../quest-view.ts';
import { territoryViewOf } from '../territory-view.ts';

export const KINGDOM = KingdomSchema.parse(kingdomExamples[0]);
export const TERRITORIES = territoryExamples.map((example) => TerritorySchema.parse(example));
export const CHARACTERS = characterExamples.map((example) => CharacterSchema.parse(example));
export const QUESTS = questExamples.map((example) => QuestSchema.parse(example));
export const CAMPAIGNS = campaignExamples.map((example) => CampaignSchema.parse(example));

export const QUEST_VIEW = questViewOf(QUESTS[0]!);
export const CHARACTER_VIEW = characterViewOf(CHARACTERS[0]!);
export const TERRITORY_VIEW = territoryViewOf(TERRITORIES[0]!);
