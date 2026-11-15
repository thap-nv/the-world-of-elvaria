// selectAssignee and planTick's claims with the assignees' measured prompts (fix/claim-step, (96) of the owner's
// settlement of 2026-11-14, (8a) of fix/verifier-prompt-limit). PS-07, on the owner's kingdom: agy takes its prompt
// on Windows' command line (at most 32 767 characters), knights' prompts ran to 51 134; an agy knight given such a
// quest could not open its session, and the quest went to the infirmary at its start (`breaker:no_session`).
import { describe, expect, it } from 'vitest';

import { NOW, Q1, Q2, character, quest, snapshot } from './__fixtures__/snapshot.ts';
import { planTick } from './plan-tick.ts';
import { selectAssignee } from './select-assignee.ts';
import { FULL_TRIBE_LIMITS } from '../tribe/tribe-limits.ts';
import type { AssigneeParty } from './select-assignee.ts';
import type { CharacterId, TribeId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { TribeLimits } from '../tribe/tribe-limits.ts';

type Limits = Partial<Record<TribeId, TribeLimits>>;
const LIMITS: Limits = {
  ['gemini' as TribeId]: { ...FULL_TRIBE_LIMITS, prompt_max_chars: 26_000 },
  ['claude' as TribeId]: FULL_TRIBE_LIMITS,
};
// ilse (gemini) has been idle the longest, so it comes first while nobody tells its prompt apart.
const ILSE = character('ilse', { tribe: 'gemini', since: 0 });
const THORN = character('thorn', { since: 30 });
const OVER = { ['ilse' as CharacterId]: 51_134 };
const LONG = quest(Q1);

const chosen = (candidates: readonly Character[], more: Partial<AssigneeParty> = {}) =>
  selectAssignee(LONG, candidates, {
    party: [],
    characters: candidates,
    prompts: { limits: LIMITS, prompt_chars: OVER },
    ...more,
  })?.id;

describe('selectAssignee and the prompt a knight’s tribe takes', () => {
  it('passes over a knight whose prompt is longer than its tribe takes while another may take the quest', () => {
    expect(chosen([ILSE, THORN], { prompts: {} })).toBe('ilse');
    expect(chosen([ILSE, THORN])).toBe('thorn');
  });

  it('waits for the other knight when it is busy, rather than start a session that cannot open', () => {
    const busy = { ...THORN, status: 'working' as const };
    expect(chosen([ILSE], { standing: [ILSE, busy] })).toBeUndefined();
  });

  it('still chooses it when nobody else may ever take the quest: the runner decides', () => {
    expect(chosen([ILSE])).toBe('ilse');
    expect(chosen([ILSE], { standing: [ILSE] })).toBe('ilse');
    // Of another class, or a level that cannot reach the rank even with a stretch, the other knight is nobody.
    const scribe = character('wren', { cls: 'scribe' });
    expect(chosen([ILSE, scribe])).toBe('ilse');
    const low = character('kael', { level: 1 });
    expect(chosen([ILSE, low])).toBe('ilse');
  });

  it('passes nobody over without a limit, a length, or with a prompt that fits', () => {
    expect(chosen([ILSE, THORN], { prompts: { limits: {}, prompt_chars: OVER } })).toBe('ilse');
    expect(chosen([ILSE, THORN], { prompts: { limits: LIMITS } })).toBe('ilse');
    const fits = { ['ilse' as CharacterId]: 26_000 };
    expect(chosen([ILSE, THORN], { prompts: { limits: LIMITS, prompt_chars: fits } })).toBe('ilse');
  });
});

describe('planTick’s claims with the prompts the Steward measured', () => {
  const claim_prompts = [{ quest: Q1, character: 'ilse' as CharacterId, chars: 51_134 }];
  const claimsOf = (characters: readonly Character[], more: Parameters<typeof snapshot>[2] = {}) =>
    planTick(snapshot([LONG], characters, { limits: LIMITS, ...more }), NOW).claims.map(
      ({ quest: id, assignee }) => [id, assignee],
    );

  it('gives the quest to the knight whose tribe takes its prompt', () => {
    expect(claimsOf([ILSE, THORN], { claim_prompts })).toEqual([[Q1, 'thorn']]);
    expect(claimsOf([ILSE, THORN])).toEqual([[Q1, 'ilse']]);
  });

  it('keeps the quest open while the other knight works, and gives ilse a quest whose prompt fits', () => {
    const busy = character('thorn', { status: 'working', since: 30 });
    const short = quest(Q2, { created: 10 });
    const plan = planTick(snapshot([LONG, short], [ILSE, busy], { limits: LIMITS, claim_prompts }), NOW);
    expect(plan.claims.map(({ quest: id, assignee }) => [id, assignee])).toEqual([[Q2, 'ilse']]);
    expect(plan.unclaimable).toEqual([]);
  });

  it('tries ilse when the other knight is suspended or its tribe may not take the quest', () => {
    const suspended = character('thorn', { status: 'suspended', since: 30 });
    expect(claimsOf([ILSE, suspended], { claim_prompts })).toEqual([[Q1, 'ilse']]);
    const ranked: Limits = { ...LIMITS, ['claude' as TribeId]: { ...FULL_TRIBE_LIMITS, max_rank: 'E' } };
    expect(claimsOf([ILSE, THORN], { claim_prompts, limits: ranked })).toEqual([[Q1, 'ilse']]);
  });
});
