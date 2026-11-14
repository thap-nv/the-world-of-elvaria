// planTick and a tribe whose CLI changed version since its last passing check (A1b of the lessons of 2026-11-13): no
// new session of that tribe, whatever the step; it still counts and stands by, so nothing is named unclaimable or
// unjudgeable for it.
import { describe, expect, it } from 'vitest';

import { NOW, Q1, Q2, character, inReview, quest, returnedTo, snapshot } from './__fixtures__/snapshot.ts';
import { planTick } from './plan-tick.ts';
import type { TribeId } from '../core/ids.ts';

const GEMINI = 'gemini' as TribeId;
const CLAUDE = 'claude' as TribeId;
/** The fixture kingdom pins agy 1.5.1 and Claude Code 2.1.318; agy now says 1.5.7. */
const AGY = 'C:/Users/owner/.gemini/bin/agy.exe';
const MOVED = {
  tools_found: {
    [GEMINI]: { path: AGY, version: '1.5.7' },
    [CLAUDE]: { path: 'C:/claude.exe', version: '2.1.318' },
  },
};

describe('planTick: a tribe held by its CLI version (A1b)', () => {
  it('gives the held tribe no claim, no redispatch and no verification', () => {
    const characters = [
      character('wren', { tribe: 'gemini', since: 0 }),
      character('thorn', { since: 50 }),
      character('orin', { cls: 'judge', tribe: 'gemini' }),
    ];
    const claimer = (more = {}) =>
      planTick(snapshot([quest(Q1)], characters, more), NOW).claims.map(({ assignee }) => assignee);
    expect(claimer()).toEqual(['wren']);
    expect(claimer(MOVED)).toEqual(['thorn']);
    const returned = (more = {}) =>
      planTick(snapshot([returnedTo(quest(Q2), 'wren')], characters, more), NOW).redispatches;
    expect(returned()).toEqual([Q2]);
    expect(returned(MOVED)).toEqual([]);
    const review = planTick(snapshot([inReview(quest(Q1), 'thorn')], characters, MOVED), NOW);
    expect(review).toMatchObject({ verifications: [], unjudgeable: [], judge_waits: [] });
  });

  it('names no quest unclaimable while only the held tribe can take it', () => {
    const plan = planTick(snapshot([quest(Q1)], [character('wren', { tribe: 'gemini' })], MOVED), NOW);
    expect(plan).toMatchObject({ claims: [], unclaimable: [] });
  });

  it('holds a tribe whose CLI is gone, as the Codex extension folder after a VS Code update (2026-11-14)', () => {
    const gone = { tools_found: { [CLAUDE]: { path: 'C:/old/claude.exe', version: undefined } } };
    expect(planTick(snapshot([quest(Q1)], [character('thorn')], gone), NOW).claims).toEqual([]);
  });

  it('holds nothing once the check passed on the version the CLI says', () => {
    const checked = (tribe: ReturnType<typeof snapshot>['kingdom']['tribes'][number]) =>
      tribe.id === GEMINI && tribe.tool !== undefined
        ? { ...tribe, tool: { ...tribe.tool, version: '1.5.7', checked_version: '1.5.7' } }
        : tribe;
    const base = snapshot([quest(Q1)], [character('wren', { tribe: 'gemini' })], MOVED);
    const kingdom = { ...base.kingdom, tribes: base.kingdom.tribes.map(checked) };
    expect(planTick({ ...base, kingdom }, NOW).claims).toEqual([{ quest: Q1, assignee: 'wren', level: 3 }]);
  });
});
