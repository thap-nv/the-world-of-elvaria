import { describe, expect, it } from 'vitest';

import { CharacterSchema } from '../schema/character/character.ts';
import { QuestSchema } from '../schema/quest/quest.ts';
import { TerritorySchema } from '../schema/territory.ts';
import { CHARACTERS, QUESTS, TERRITORIES } from './__fixtures__/examples.ts';
import { CharacterViewSchema, characterViewOf } from './character-view.ts';
import { QuestViewSchema, questViewOf } from './quest-view.ts';
import { TerritoryViewSchema, territoryViewOf } from './territory-view.ts';
import type { Quest } from '../schema/quest/quest.ts';

const [inReview, scriptDone, open] = QUESTS as [Quest, Quest, Quest];

/** A quest that names everything a view can show: party, campaign, parent, seal, delivery. */
const everything = QuestSchema.parse({
  ...scriptDone,
  party_id: 'q_20261106_9p4r8e',
  party_role: 'part',
  contract: 'apps/api/openapi.json',
  campaign_id: 'c_20261110_5m8q2r',
  parent_id: 'q_20261105_4c8n2d',
  depends_on: ['q_20261106_9p4r8e'],
  seal_required: true,
  seal: { at: '2026-11-06T18:00:00+07:00' },
  deliverable: { type: 'report', path: 'reports/links.md', delivered_at: '2026-11-06T18:05:00+07:00' },
});

describe('questViewOf', () => {
  it('projects every v1 example onto a valid view, with null for what the quest does not have', () => {
    for (const quest of QUESTS) expect(QuestViewSchema.parse(questViewOf(quest))).toEqual(questViewOf(quest));
    expect(questViewOf(inReview)).toMatchObject({
      status: 'review',
      assignee: 'thorn',
      verifier: 'brann',
      class_required: 'knight',
      max_attempts: inReview.budget.max_attempts,
      sealed_at: null,
      party_id: null,
      campaign_id: null,
      delivered_at: null,
    });
    expect(questViewOf(scriptDone)).toMatchObject({ tier: 'script', class_required: null, assignee: null });
  });

  it('shows party, campaign, parent, seal and delivery when the quest has them', () => {
    expect(questViewOf(everything)).toMatchObject({
      party_id: 'q_20261106_9p4r8e',
      party_role: 'part',
      campaign_id: 'c_20261110_5m8q2r',
      parent_id: 'q_20261105_4c8n2d',
      depends_on: ['q_20261106_9p4r8e'],
      sealed_at: '2026-11-06T18:00:00+07:00',
      delivered_at: '2026-11-06T18:05:00+07:00',
    });
  });

  it('asks the question only while it waits for an answer', () => {
    const asked = { question: 'Giữ API cũ không?', asked_at: '2026-11-06T10:00:00+07:00' };
    const blocked = QuestSchema.parse({ ...open, status: 'blocked', blocked: asked });
    expect(questViewOf(blocked).question).toBe('Giữ API cũ không?');
    const answered = { ...asked, answer: 'Giữ.', answered_at: '2026-11-06T10:05:00+07:00' };
    expect(questViewOf(QuestSchema.parse({ ...open, blocked: answered })).question).toBeNull();
    expect(questViewOf(open).question).toBeNull();
  });

  it('carries no field of the file the world has no use for', () => {
    const keys = Object.keys(questViewOf(inReview));
    for (const field of ['description', 'attempt_log', 'plot', 'budget', 'estimate', 'script', 'units']) {
      expect(keys).not.toContain(field);
    }
  });
});

describe('characterViewOf', () => {
  const [thorn, sable] = CHARACTERS;

  it('derives the ring and the title, which the file never stores', () => {
    expect(CharacterViewSchema.parse(characterViewOf(thorn!))).toEqual({
      id: 'thorn',
      name: 'Thorn',
      class: 'knight',
      tribe: 'claude',
      model: 'claude-sonnet-5-5',
      level: 3,
      status: 'working',
      status_since: '2026-11-06T09:12:03+07:00',
      current: { quest: 'q_20261106_7k3m2a', role: 'assignee' },
      reputation: { verdicts: 2, pct: 100 },
      title: null,
    });
    expect(characterViewOf(CharacterSchema.parse({ ...thorn, pinned_tag: 'i18n' })).title).toBe('i18n');
  });

  it('shows no quest and no rate for a sleeping judge without verdicts', () => {
    expect(characterViewOf(sable!)).toMatchObject({
      status: 'sleeping_mana',
      current: null,
      reputation: { verdicts: 0, pct: null },
    });
    const { current: _none, ...withoutCurrent } = sable!;
    expect(characterViewOf(CharacterSchema.parse(withoutCurrent)).current).toBeNull();
  });
});

describe('territoryViewOf', () => {
  const [dc1] = TERRITORIES;

  it('keeps name, kind and health, with null for a patrol or survey that never happened', () => {
    const { surveyed_at: _never, ...unsurveyed } = dc1!;
    const fresh = TerritorySchema.parse({ ...unsurveyed, health: { ci: 'unknown', open_bugs: 0 } });
    expect(TerritoryViewSchema.parse(territoryViewOf(fresh))).toEqual({
      id: 'dc1-se-team',
      name: 'dc1-se-team',
      kind: 'code',
      health: { ci: 'unknown', open_bugs: 0, last_patrol_at: null },
      surveyed_at: null,
    });
  });

  it('dates the last patrol and survey when there were some', () => {
    const surveyed = TerritorySchema.parse({
      ...dc1,
      health: { ci: 'green', open_bugs: 0, last_patrol_at: '2026-11-05T21:00:00+07:00' },
      surveyed_at: '2026-11-04T10:00:00+07:00',
    });
    expect(territoryViewOf(surveyed)).toMatchObject({
      health: { ci: 'green', open_bugs: 0, last_patrol_at: '2026-11-05T21:00:00+07:00' },
      surveyed_at: '2026-11-04T10:00:00+07:00',
    });
  });
});
