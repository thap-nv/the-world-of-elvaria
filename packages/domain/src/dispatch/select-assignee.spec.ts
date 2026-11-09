import { describe, expect, it } from 'vitest';

import { KINGDOM, Q1, Q2, Q3, Q4, at, character, quest } from './__fixtures__/snapshot.ts';
import { namedAssignee, selectAssignee } from './select-assignee.ts';
import type { CharacterId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { Quest } from '../schema/quest/quest.ts';

const chosen = (candidates: readonly Character[], spec: Parameters<typeof quest>[1] = {}) =>
  selectAssignee(quest(Q1, { tags: ['frontend', 'i18n'], ...spec }), candidates)?.id;

describe('selectAssignee', () => {
  it('takes only the required class', () => {
    expect(chosen([character('wren', { cls: 'scribe' })])).toBeUndefined();
    expect(chosen([character('wren', { cls: 'scribe' }), character('thorn')])).toBe('thorn');
  });

  it('prefers a character whose level takes the rank over one it would stretch, never two ranks', () => {
    // Rank C: level 4 takes it as a matter of course; level 3 (ceiling D) only when nobody else can.
    const both = [character('kael', { level: 3, since: 0 }), character('thorn', { level: 4, since: 30 })];
    expect(chosen(both, { rank: 'C' })).toBe('thorn');
    expect(chosen([character('kael', { level: 3 })], { rank: 'C' })).toBe('kael');
    expect(chosen([character('kael', { level: 3 })], { rank: 'B' })).toBeUndefined();
  });

  it("ranks by the pass rate on the quest's tags, a character without verdicts on them last", () => {
    const candidates = [
      character('ash', { since: 0 }),
      character('kael', { since: 10, affinity: { frontend: ['pass', 'fail'] } }),
      character('thorn', { since: 20, affinity: { frontend: ['pass'], i18n: ['pass', 'pass'] } }),
      character('brann', { since: 0, affinity: { db: ['pass'] } }),
    ];
    expect(chosen(candidates)).toBe('thorn');
    expect(chosen(candidates.slice(0, 2))).toBe('kael');
  });

  it('puts a character pinned to one of the tags first, whatever its rate', () => {
    const candidates = [
      character('thorn', { affinity: { frontend: ['pass'] } }),
      character('kael', { pinned: 'i18n', affinity: { frontend: ['fail'] } }),
      character('ash', { pinned: 'db' }),
    ];
    expect(chosen(candidates)).toBe('kael');
  });

  it('breaks a tie by who has been idle the longest, then by id', () => {
    expect(chosen([character('thorn', { since: 20 }), character('kael', { since: 5 })])).toBe('kael');
    expect(chosen([character('thorn', { since: 5 }), character('kael', { since: 5 })])).toBe('kael');
  });
});

describe('selectAssignee in a party (P1-21)', () => {
  const judged = (base: Quest, judge: string): Quest => ({
    ...base,
    attempt_log: [
      {
        n: 1,
        character: judge as CharacterId,
        role: 'verifier',
        started_at: at(0),
        run_dir: '.runs/x-1/verify',
      },
    ],
  });
  const worked = (base: Quest, assignee: string): Quest => ({ ...base, assignee: assignee as CharacterId });
  const contract = quest(Q1, { party: Q1, kind: 'plan', cls: 'mage' });
  const api = quest(Q2, { party: Q1, dependsOn: [Q1] });
  const web = quest(Q3, { party: Q1, dependsOn: [Q1] });
  const tests: Quest = { ...quest(Q4, { party: Q1, dependsOn: [Q1] }), party_role: 'acceptance' };
  const opus = character('vesper', { model: 'claude-opus-5-5', since: 0 });
  const sonnet = character('thorn', { since: 10 });
  const gemini = character('ilse', { tribe: 'gemini', model: 'gemini-3.8-flash-high', since: 20 });
  const all = [opus, sonnet, gemini];
  const pick = (target: Quest, party: readonly Quest[], candidates = all) =>
    selectAssignee(target, candidates, { party, characters: all })?.id;

  it('never gives work of the party to whoever judged a quest of it, its own included', () => {
    expect(pick(web, [contract, judged(api, 'vesper')])).toBe('thorn');
    expect(pick(judged(web, 'vesper'), [contract, api])).toBe('thorn');
    expect(
      pick(web, [contract, judged(api, 'vesper'), judged(api, 'thorn')], [opus, sonnet]),
    ).toBeUndefined();
  });

  it("keeps the acceptance writer apart from the parts' assignees, and prefers another model family", () => {
    // thorn (claude) built the API: the tests go to the gemini knight, though vesper was idle longer.
    expect(pick(tests, [contract, worked(api, 'thorn'), web])).toBe('ilse');
    expect(pick(tests, [contract, worked(api, 'thorn'), web], [opus, sonnet])).toBe('vesper');
    // ilse wrote the tests: no part goes to it, and a part prefers a family other than gemini.
    expect(pick(web, [contract, api, worked(tests, 'ilse')], [gemini])).toBeUndefined();
    expect(pick(web, [contract, api, worked(tests, 'ilse')])).toBe('vesper');
  });

  it('weighs no family outside a blind trial, nor for the contract or the merge quest', () => {
    const merge: Quest = {
      ...quest('q_20261106_m5n6p7', { party: Q1, dependsOn: [Q2, Q3, Q4] }),
      party_role: 'merge',
    };
    expect(pick(web, [contract, worked(api, 'vesper')])).toBe('vesper');
    expect(pick(merge, [contract, worked(api, 'vesper'), worked(tests, 'ilse')])).toBe('vesper');
  });
});

describe('namedAssignee', () => {
  // The example kingdom: claude and gemini enabled, codex disabled; a tribe it does not list is not enabled.
  const TRIBES = KINGDOM.tribes;

  it("takes the owner's character of the class whatever its level, busy or not", () => {
    const ember = character('ember', { level: 1, status: 'working' });
    expect(namedAssignee('knight', ember, TRIBES)).toEqual({ ok: true, value: ember });
    const wren = character('wren', { cls: 'scribe', tribe: 'gemini' });
    expect(namedAssignee('scribe', wren, TRIBES)).toEqual({ ok: true, value: wren });
  });

  it.each([
    ['unknown_character', undefined],
    ['class_mismatch', character('wren', { cls: 'scribe' })],
    ['character_suspended', character('rook', { status: 'suspended' })],
    ['tribe_disabled', character('vex', { tribe: 'codex' })],
    ['tribe_disabled', character('ash', { tribe: 'mistral' })],
  ])('refuses %s', (code, named) => {
    expect(namedAssignee('knight', named, TRIBES)).toEqual({ ok: false, error: { code } });
  });
});
