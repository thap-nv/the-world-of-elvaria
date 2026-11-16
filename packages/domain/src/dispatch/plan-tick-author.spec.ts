// planTick and an amendment's author (fix/amendment-owner-accept, (126) of the 2026-11-15 log): the author's session
// (PS-22b) lies outside its tribe's slots and starts only once no session of that tribe runs, as the triage's does,
// so while a quest waits on its author's decision, the author's tribe opens no new session, whatever the step. The
// author is the Chancellor the job picks for a quest it drafted, the mage of the plan for a council's quest; another
// tribe works on, and the decision applied (or handed to the owner) frees the tribe.
import { describe, expect, it } from 'vitest';

import {
  NOW,
  Q1,
  Q2,
  Q3,
  Q4,
  character,
  inReview,
  moved,
  quest,
  returnedTo,
  snapshot,
  workingBy,
} from './__fixtures__/snapshot.ts';
import { planTick } from './plan-tick.ts';
import type { MemoId, QuestId, TribeId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { BlockedAmendment } from '../schema/quest/quest-parts.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { KingdomSnapshot } from './plan-tick.ts';

/** The fixture's characters are of Claude Code unless said otherwise. */
const VIZIER = character('vizier', { cls: 'chancellor' });
const MERLIN = character('merlin', { cls: 'mage', tribe: 'gemini' });
const MEMO = 'm_20261116_4k2pqz' as MemoId;
/** A parent the kingdom holds no file of: its quest has no author but the owner. */
const MISSING = 'q_20261106_zzzzzz' as QuestId;

/** Q2, its doer's run ended on an amendment that `by` decides; `change` as the Steward later wrote it. */
const waiting = (by: BlockedAmendment['by'] = 'author', change: Partial<BlockedAmendment> = {}): Quest =>
  moved(workingBy(quest(Q2), 'ash', 10), 20, [
    'ask',
    'runner',
    { question: 'Đề bài sai.', amendment: { memo: MEMO, by, ...change } },
  ]);

/** The plan quest the mage did, and a council's quest made from it that waits on its author. */
const PLAN: Quest = { ...quest(Q3, { status: 'done' }), assignee: 'merlin' as Quest['assignee'] };
const child = (parent: QuestId = Q3): Quest => ({ ...waiting(), created_by: 'council', parent_id: parent });

const claimers = (
  quests: readonly Quest[],
  characters: readonly Character[],
  more: Partial<KingdomSnapshot> = {},
) => planTick(snapshot([quest(Q1), ...quests], characters, more), NOW).claims.map(({ assignee }) => assignee);

describe("planTick: the author's tribe kept for an amendment it has not decided (fix/amendment-owner-accept)", () => {
  const knights = [character('thorn', { since: 0 }), character('wren', { tribe: 'gemini', since: 50 })];

  it("keeps the Chancellor's tribe from a claim, a redispatch and a verification while its quest waits", () => {
    expect(claimers([], [VIZIER, ...knights])).toEqual(['thorn']);
    expect(claimers([waiting()], [VIZIER, ...knights])).toEqual(['wren']);
    const returned = (quests: readonly Quest[]) =>
      planTick(snapshot([returnedTo(quest(Q3), 'thorn'), ...quests], [VIZIER, ...knights]), NOW).redispatches;
    expect(returned([])).toEqual([Q3]);
    expect(returned([waiting()])).toEqual([]);
    const judged = [VIZIER, character('wren', { tribe: 'gemini' }), character('sable', { cls: 'judge' })];
    const review = planTick(snapshot([inReview(quest(Q1), 'wren'), waiting()], judged), NOW);
    expect(review).toMatchObject({ verifications: [], unjudgeable: [], judge_waits: [] });
  });

  it('keeps the tribe of the mage of the plan for a council quest, and nothing for a mage gone', () => {
    const gemini = [
      MERLIN,
      character('wren', { tribe: 'gemini', since: 0 }),
      character('thorn', { since: 50 }),
    ];
    expect(claimers([PLAN], gemini)).toEqual(['wren']);
    expect(claimers([PLAN, child()], gemini)).toEqual(['thorn']);
    const suspended = character('merlin', { cls: 'mage', tribe: 'gemini', status: 'suspended' });
    expect(claimers([PLAN, child()], [suspended, character('wren', { tribe: 'gemini' })])).toEqual(['wren']);
    expect(claimers([PLAN, child(MISSING)], [MERLIN, character('wren', { tribe: 'gemini' })])).toEqual([
      'wren',
    ]);
  });

  it('frees the tribe once the decision is in, or the owner decides, or nobody would speak', () => {
    const tribe = [VIZIER, character('thorn')];
    expect(claimers([waiting('author', { decision: 'accepted' })], tribe)).toEqual(['thorn']);
    expect(claimers([waiting('owner')], tribe)).toEqual(['thorn']);
    expect(claimers([waiting()], [character('thorn')])).toEqual(['thorn']);
    const held = { tools_found: { ['claude' as TribeId]: { path: 'C:/claude.exe', version: '9.9.9' } } };
    expect(claimers([waiting()], [VIZIER, character('wren', { tribe: 'gemini' })], held)).toEqual(['wren']);
  });

  it('keeps one tribe for the triage and the author alike, and both of two authors', () => {
    const both = claimers([waiting()], [VIZIER, ...knights], { jobs_due: ['triage'] });
    expect(both).toEqual(['wren']);
    expect(claimers([waiting(), PLAN, { ...child(), id: Q4 }], [VIZIER, MERLIN, ...knights])).toEqual([]);
  });
});
