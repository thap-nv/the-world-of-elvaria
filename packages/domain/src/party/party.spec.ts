import { describe, expect, it } from 'vitest';

import { DOCS, Q1, Q2, Q3, Q4, quest } from '../dispatch/__fixtures__/snapshot.ts';
import { QUEST_TAGS_MAX, QUEST_TITLE_MAX_LENGTH } from '../constants.ts';
import { MERGE_CLASS, MERGE_KIND, mergeQuestOf } from './merge-quest.ts';
import { partyStatusOf } from './party-status.ts';
import { plotBaseOf } from './plot-base.ts';
import type { CampaignId, QuestId, TagId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { Parts } from './merge-quest.ts';

const MERGE = 'q_20261106_m5n6p7' as QuestId;
const LONE = 'q_20261106_r8s9t1' as QuestId;

/** On its worktree, branch quest/<id>, like PlotManager leaves every quest of a git territory. */
const onBranch = (base: Quest): Quest => ({
  ...base,
  plot: { type: 'worktree', path: `D:/dc1/.elvaria/worktrees/${base.id}`, branch: `quest/${base.id}` },
});

const contract = onBranch({ ...quest(Q1, { party: Q1, kind: 'plan', cls: 'mage' }), title: 'Book a room' });
const api = onBranch({
  ...quest(Q2, { party: Q1, dependsOn: [Q1], tags: ['backend', 'db'], rank: 'C' }),
  secrets_required: ['npm_token'],
});
const web = onBranch(quest(Q3, { party: Q1, dependsOn: [Q1, Q2], tags: ['frontend', 'backend'], rank: 'E' }));
const merge: Quest = onBranch({
  ...quest(MERGE, { party: Q1, dependsOn: [Q2, Q3] }),
  party_role: 'merge',
});

describe('mergeQuestOf', () => {
  it("opens the merge quest under the contract, waiting for every part, with the parts' tags and secrets", () => {
    const made = mergeQuestOf(contract, [api, web]);
    expect(made.party).toEqual({ id: Q1, role: 'merge', contract: 'api/openapi.yaml' });
    expect(made.payload).toEqual({
      draft: false,
      title: 'Book a room',
      description: expect.stringContaining(`The merge quest of party ${Q1} («Book a room»)`) as string,
      kind: MERGE_KIND,
      rank: 'C',
      territory: contract.territory,
      tier: 'session',
      class_required: MERGE_CLASS,
      tags: ['backend', 'db', 'frontend'],
      seal_required: true,
      secrets_required: ['npm_token'],
      depends_on: [Q2, Q3],
      parent_id: Q1,
      created_by: 'council',
    });
    expect(made.payload.description).toContain(`- quest/${Q2}: ${api.title}\n- quest/${Q3}: ${web.title}`);
    expect(made.payload.description).toContain('`api/openapi.yaml`');
  });

  it("keeps the contract's campaign, clips a long title and too many tags, and asks for no secret when none", () => {
    const tags = ['frontend', 'backend', 'db', 'infra', 'i18n', 'e2e', 'docs'] as TagId[];
    const long = {
      ...contract,
      title: 'x'.repeat(QUEST_TITLE_MAX_LENGTH + 5),
      campaign_id: 'c_x' as CampaignId,
    };
    const parts: Parts = [
      { ...web, tags: tags.slice(0, 4) },
      { ...web, id: Q4, tags: tags.slice(3), rank: 'B' },
    ];
    const { payload } = mergeQuestOf(long, parts);
    expect(payload.title).toHaveLength(QUEST_TITLE_MAX_LENGTH);
    expect(payload.title.endsWith('…')).toBe(true);
    expect(payload.tags).toEqual(tags.slice(0, QUEST_TAGS_MAX));
    expect(payload.campaign_id).toBe('c_x');
    expect(payload.secrets_required).toBeUndefined();
    expect(payload.rank).toBe('B');
  });

  it('names no contract path when the parts name none', () => {
    const { contract: _path, ...bare } = api;
    expect(mergeQuestOf(contract, [bare]).party.contract).toBe('');
  });
});

describe('plotBaseOf', () => {
  const all = [contract, api, web, merge];

  it("starts a part from the branch of a part it waits for, then from the contract's", () => {
    expect(plotBaseOf(api, all)).toEqual({ from: [`quest/${Q1}`], merge: [] });
    expect(plotBaseOf(web, all)).toEqual({ from: [`quest/${Q2}`, `quest/${Q1}`], merge: [] });
  });

  it("starts the merge quest from the contract's branch and merges every part into it", () => {
    expect(plotBaseOf(merge, all)).toEqual({ from: [`quest/${Q1}`], merge: [`quest/${Q2}`, `quest/${Q3}`] });
  });

  it('starts any other quest, a contract too, from the branches of what it waits for (P1-16 (f))', () => {
    const chained = quest(LONE, { dependsOn: [Q2, Q3] });
    expect(plotBaseOf(chained, all)).toEqual({ from: [`quest/${Q2}`, `quest/${Q3}`], merge: [] });
    expect(plotBaseOf({ ...contract, depends_on: [Q2] }, all)).toEqual({ from: [`quest/${Q2}`], merge: [] });
    expect(plotBaseOf(quest(LONE), all)).toEqual({ from: [], merge: [] });
  });

  it('starts from nothing a dependency of another territory, without a worktree, without a branch or unknown', () => {
    const elsewhere = { ...api, territory: DOCS };
    const folder: Quest = { ...web, plot: { type: 'folder', path: `quests/${Q3}/work` } };
    const bare: Quest = { ...merge, plot: { type: 'worktree', path: 'D:/dc1/x' } };
    const chained = quest(LONE, { dependsOn: [Q2, Q3, MERGE, Q4] });
    expect(plotBaseOf(chained, [elsewhere, folder, bare])).toEqual({ from: [], merge: [] });
  });
});

describe('partyStatusOf', () => {
  const at = (stage: readonly Quest[]) => partyStatusOf(Q1, [...stage, quest(LONE)]);
  const done = (member: Quest): Quest => ({ ...member, status: 'done' });
  const archived = (member: Quest, delivered: boolean): Quest => ({
    ...member,
    status: 'archived',
    deliverable: delivered
      ? { type: 'branch', delivered_at: '2026-11-06T10:00:00+07:00' }
      : { type: 'branch' },
  });

  it('follows the party from its contract through its parts to its merge quest', () => {
    expect(at([contract])).toEqual({
      party: Q1,
      stage: 'forming',
      parts: { done: 0, total: 0 },
      merge: null,
    });
    expect(at([done(contract), api, web, merge])).toMatchObject({ stage: 'parts', merge: MERGE });
    expect(at([done(contract), done(api), web, merge])).toMatchObject({
      stage: 'parts',
      parts: { done: 1, total: 2 },
    });
    expect(at([done(contract), done(api), archived(web, true), merge])).toMatchObject({
      stage: 'merging',
      parts: { done: 2, total: 2 },
    });
    expect(at([archived(contract, true), done(api), done(web), done(merge)])).toMatchObject({
      stage: 'done',
    });
  });

  it('is stuck once a member is dropped, or when the delivered contract opened no part', () => {
    expect(at([archived(contract, false)])).toMatchObject({ stage: 'stuck' });
    expect(at([done(contract), archived(api, false), web, merge])).toMatchObject({ stage: 'stuck' });
    expect(at([done(contract), done(api), done(web), archived(merge, false)])).toMatchObject({
      stage: 'stuck',
    });
    expect(at([done(contract)])).toMatchObject({ stage: 'stuck', merge: null });
  });

  it('knows no party whose contract quest it is not given', () => {
    expect(partyStatusOf(Q1, [api, web, merge])).toBeUndefined();
  });
});
