import {
  CampaignIdSchema,
  CharacterIdSchema,
  QuestIdSchema,
  REGISTRY_FILES,
  TerritoryIdSchema,
  VerdictIdSchema,
} from '@elvaria/domain';
import { describe, expect, it } from 'vitest';

import {
  CAMPAIGN_SPEC,
  CHARACTER_SPEC,
  QUEST_SPEC,
  TERRITORY_SPEC,
  VERDICT_SPEC,
  entityFile,
} from './entities.ts';
import { KINGDOM_DIRS, KINGDOM_FILE, kingdomLayout } from './layout.ts';

const quest = QuestIdSchema.parse('q_20261106_7k3m2a');
const character = CharacterIdSchema.parse('thorn');
const territory = TerritoryIdSchema.parse('dc1-se-team');
const campaign = CampaignIdSchema.parse('c_20261110_5m8q2r');
const verdict = VerdictIdSchema.parse('q_20261106_7k3m2a-2');

describe('kingdomLayout (implementation-plan §2.2)', () => {
  it('puts every file in a folder that init creates, or at the root', () => {
    const paths = [
      kingdomLayout.kingdom(),
      ...REGISTRY_FILES.map(kingdomLayout.registryFile),
      kingdomLayout.registryEntry('prompts/judge.md'),
      kingdomLayout.territory(territory),
      kingdomLayout.gazetteer(territory),
      kingdomLayout.quest(quest),
      kingdomLayout.questDir(quest),
      kingdomLayout.handover(quest),
      kingdomLayout.journal(quest),
      kingdomLayout.character(character),
      kingdomLayout.scripture(character),
      kingdomLayout.campaign(campaign),
      kingdomLayout.verdict(verdict),
      kingdomLayout.inboxCommand('01JCFB7Q2R8S4T6V9W3X5Y1Z0A'),
      kingdomLayout.inboxDone('01JCFB7Q2R8S4T6V9W3X5Y1Z0A'),
      kingdomLayout.runDir(quest, 2),
      kingdomLayout.stewardLock(),
      kingdomLayout.backup('20261106T091203'),
    ];
    for (const file of paths) {
      expect(file === KINGDOM_FILE || KINGDOM_DIRS.some((dir) => file.startsWith(`${dir}/`))).toBe(true);
      expect(file).not.toContain('\\');
    }
  });

  it('spells the paths the plan and the ADRs name', () => {
    expect(kingdomLayout.quest(quest)).toBe('quests/q_20261106_7k3m2a.json');
    expect(kingdomLayout.handover(quest)).toBe('quests/q_20261106_7k3m2a/handover.md');
    expect(kingdomLayout.journal(quest)).toBe('quests/q_20261106_7k3m2a/journal.jsonl');
    expect(kingdomLayout.runDir(quest, 1)).toBe('.runs/q_20261106_7k3m2a-1');
    expect(kingdomLayout.stewardLock()).toBe('.state/steward.lock');
    expect(kingdomLayout.inboxDone('X')).toBe('inbox/done/X.json');
  });

  it('agrees with where the entity table stores each entity', () => {
    expect(entityFile(QUEST_SPEC, quest)).toBe(kingdomLayout.quest(quest));
    expect(entityFile(TERRITORY_SPEC, territory)).toBe(kingdomLayout.territory(territory));
    expect(entityFile(CHARACTER_SPEC, character)).toBe(kingdomLayout.character(character));
    expect(entityFile(CAMPAIGN_SPEC, campaign)).toBe(kingdomLayout.campaign(campaign));
    expect(entityFile(VERDICT_SPEC, verdict)).toBe(kingdomLayout.verdict(verdict));
  });
});
