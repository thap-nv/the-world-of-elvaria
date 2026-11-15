// planTick and the Chancellor's triage (fix/acceptance-scope, (122) of the 2026-11-15 log): its session lies outside
// its tribe's slots and starts only once no session of that tribe runs (PS-03b), so while a triage due today has not
// started, the Chancellor's tribe opens no new session, whatever the step. Another tribe works on, and the tribe kept
// free still counts and stands by, so nothing is named unclaimable or unjudgeable for it.
import { describe, expect, it } from 'vitest';

import { NOW, Q1, Q2, character, inReview, quest, returnedTo, snapshot } from './__fixtures__/snapshot.ts';
import { planTick } from './plan-tick.ts';
import type { TribeId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { KingdomSnapshot } from './plan-tick.ts';

/** The fixture's characters are of Claude Code unless said otherwise. */
const VIZIER = character('vizier', { cls: 'chancellor' });
const DUE: Partial<KingdomSnapshot> = { jobs_due: ['triage'] };

const claimers = (characters: readonly Character[], more: Partial<KingdomSnapshot> = {}) =>
  planTick(snapshot([quest(Q1)], characters, more), NOW).claims.map(({ assignee }) => assignee);

describe("planTick: the Chancellor's tribe kept for a triage due (fix/acceptance-scope)", () => {
  it('gives the tribe no claim, no redispatch and no verification, and another tribe takes the work', () => {
    const characters = [
      VIZIER,
      character('thorn', { since: 0 }),
      character('wren', { tribe: 'gemini', since: 50 }),
    ];
    expect(claimers(characters)).toEqual(['thorn']);
    expect(claimers(characters, DUE)).toEqual(['wren']);
    const returned = (more: Partial<KingdomSnapshot> = {}) =>
      planTick(snapshot([returnedTo(quest(Q2), 'thorn')], characters, more), NOW).redispatches;
    expect(returned()).toEqual([Q2]);
    expect(returned(DUE)).toEqual([]);
    const judged = [VIZIER, character('wren', { tribe: 'gemini' }), character('sable', { cls: 'judge' })];
    const review = (more: Partial<KingdomSnapshot> = {}) =>
      planTick(snapshot([inReview(quest(Q1), 'wren')], judged, more), NOW);
    expect(review().verifications).toHaveLength(1);
    expect(review(DUE)).toMatchObject({ verifications: [], unjudgeable: [], judge_waits: [] });
  });

  it('names no quest unclaimable while only the kept tribe can take it', () => {
    const plan = planTick(snapshot([quest(Q1)], [VIZIER, character('thorn')], DUE), NOW);
    expect(plan).toMatchObject({ claims: [], unclaimable: [] });
  });

  it('keeps the tribe of the Chancellor the triage will pick, a held tribe giving way (pickChancellor)', () => {
    const elder = character('elder', { cls: 'chancellor', tribe: 'gemini', level: 6 });
    const knights = [character('thorn', { since: 0 }), character('wren', { tribe: 'gemini', since: 50 })];
    expect(claimers([VIZIER, elder, ...knights], DUE)).toEqual(['thorn']);
    const moved = { tools_found: { ['gemini' as TribeId]: { path: 'C:/agy.exe', version: '1.5.7' } } };
    expect(claimers([VIZIER, elder, ...knights], { ...DUE, ...moved })).toEqual([]);
  });

  it('keeps nothing when no job of the Chancellor is due, or nobody would speak', () => {
    expect(claimers([VIZIER, character('thorn')], { jobs_due: ['chronicle', 'digest'] })).toEqual(['thorn']);
    expect(claimers([character('thorn')], DUE)).toEqual(['thorn']);
    const moved = { tools_found: { ['claude' as TribeId]: { path: 'C:/claude.exe', version: '9.9.9' } } };
    const held = [VIZIER, character('wren', { tribe: 'gemini' })];
    expect(claimers(held, { ...DUE, ...moved })).toEqual(['wren']);
  });
});
