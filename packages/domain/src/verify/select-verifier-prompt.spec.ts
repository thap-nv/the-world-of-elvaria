// selectVerifier with the judges' measured prompts (fix/verifier-prompt-limit). PS-07, on the owner's kingdom: every
// judge's prompt was over the 32 767 characters Windows takes on agy's command line (median 36 878), and the agy judge
// ilse was chosen though its session could not open; since fix/review-no-session that costs one of REVIEW_BREAKS_MAX.
import { describe, expect, it } from 'vitest';

import {
  CLASSES,
  NOW,
  Q1,
  Q2,
  character,
  inReview,
  moved,
  quest,
  snapshot,
} from '../dispatch/__fixtures__/snapshot.ts';
import { planTick } from '../dispatch/plan-tick.ts';
import { FULL_TRIBE_LIMITS } from '../tribe/tribe-limits.ts';
import { overPromptLimit, promptCharsOf, withinPromptLimit } from './prompt-limit.ts';
import { awaitedJudges, selectVerifier } from './select-verifier.ts';
import type { CharacterId, TribeId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { TribeLimits } from '../tribe/tribe-limits.ts';
import type { VerifierPolicy } from './select-verifier.ts';

const THORN = character('thorn');
const judge = (id: string, spec: Parameters<typeof character>[1] = {}) =>
  character(id, { cls: 'judge', model: 'claude-opus-5-5', ...spec });
const ILSE = judge('ilse', { tribe: 'gemini', model: 'gemini-3.8-flash-high' });
const MAREN = judge('maren');
const submitted = inReview(quest(Q1), 'thorn');
type Limits = Partial<Record<TribeId, TribeLimits>>;
const LIMITS: Limits = {
  ['gemini' as TribeId]: { ...FULL_TRIBE_LIMITS, prompt_max_chars: 28_000 },
  ['claude' as TribeId]: FULL_TRIBE_LIMITS,
};
const CLAUDE_ONLY: Limits = { ['claude' as TribeId]: FULL_TRIBE_LIMITS };
const OVER = { ['ilse' as CharacterId]: 39_636, ['maren' as CharacterId]: 39_636 };

const policyOf = (more: Partial<VerifierPolicy> = {}): VerifierPolicy => ({
  same_family: 'different_model',
  classes: CLASSES,
  doers: [THORN],
  party: [],
  free: (candidate) => candidate.status === 'idle',
  limits: LIMITS,
  prompt_chars: OVER,
  ...more,
});

const chosen = (q: Quest, candidates: readonly Character[], more: Partial<VerifierPolicy> = {}) => {
  const selection = selectVerifier(q, candidates, policyOf(more));
  return selection === null || selection.reason === 'machine_only' ? selection : selection.character.id;
};

describe('selectVerifier and the prompt a judge’s tribe takes', () => {
  it('passes over a judge whose prompt is longer than its tribe takes while another may judge', () => {
    // ilse is of another family than thorn, so it would come first; its session would not open.
    expect(chosen(submitted, [ILSE, MAREN], { prompt_chars: {} })).toBe('ilse');
    expect(chosen(submitted, [ILSE, MAREN])).toBe('maren');
  });

  it('waits for the other judge when it is busy, and names only that one as awaited', () => {
    const busy = { ...MAREN, status: 'reviewing' as const };
    expect(chosen(submitted, [ILSE, busy])).toBeNull();
    expect(awaitedJudges(submitted, [ILSE, busy], policyOf()).map(({ id }) => id)).toEqual(['maren']);
  });

  it('still chooses it when nobody else may ever judge: the runner decides, and a refusal leaves the review', () => {
    expect(chosen(submitted, [ILSE])).toBe('ilse');
    // Under machine_only the other family counts: maren is of thorn's, so ilse is tried before the machine.
    expect(chosen(submitted, [ILSE, MAREN], { same_family: 'machine_only' })).toBe('ilse');
  });

  it('prefers a judge that left the review over one whose session cannot open (fix/review-no-session)', () => {
    const left = moved(submitted, 20, ['no_session', 'steward', { verifier: 'maren' }]);
    expect(chosen(left, [ILSE, MAREN])).toBe('maren');
  });

  it('passes nobody over without a limit, a length, or with a prompt that fits', () => {
    expect(chosen(submitted, [ILSE, MAREN], { limits: CLAUDE_ONLY })).toBe('ilse');
    expect(chosen(submitted, [ILSE, MAREN], { prompt_chars: { ['ilse' as CharacterId]: 28_000 } })).toBe(
      'ilse',
    );
    const { limits: _limits, prompt_chars: _chars, ...bare } = policyOf();
    expect(selectVerifier(submitted, [ILSE, MAREN], bare)).toMatchObject({ character: { id: 'ilse' } });
  });
});

describe('prompt-limit helpers', () => {
  it('keeps the fit judges whose prompt fits when one of them may judge, all of them otherwise', () => {
    const policy = { limits: LIMITS, prompt_chars: OVER };
    expect(overPromptLimit(ILSE, policy)).toBe(true);
    expect(overPromptLimit(MAREN, policy)).toBe(false);
    expect(withinPromptLimit([ILSE, MAREN], () => true, policy)).toEqual([MAREN]);
    expect(withinPromptLimit([ILSE, MAREN], ({ id }) => id === 'ilse', policy)).toEqual([ILSE, MAREN]);
  });

  it('reads the measured prompts of one quest from the snapshot', () => {
    const prompts = [
      { quest: Q1, character: 'ilse' as CharacterId, chars: 39_636 },
      { quest: Q2, character: 'ilse' as CharacterId, chars: 1_000 },
    ];
    expect(promptCharsOf(Q1, prompts)).toEqual({ ilse: 39_636 });
    expect(promptCharsOf(Q1, undefined)).toEqual({});
  });
});

describe('planTick with the prompts the Steward measured', () => {
  it('gives the review to the judge whose tribe takes its prompt', () => {
    const limits = LIMITS;
    const judges = [THORN, ILSE, MAREN];
    const review_prompts = [{ quest: Q1, character: 'ilse' as CharacterId, chars: 39_636 }];
    const measured = planTick(snapshot([submitted], judges, { limits, review_prompts }), NOW);
    expect(measured.verifications).toEqual([
      { quest: Q1, verifier: 'maren', reason: 'same_family_other_model' },
    ]);
    const unmeasured = planTick(snapshot([submitted], judges, { limits }), NOW);
    expect(unmeasured.verifications).toEqual([{ quest: Q1, verifier: 'ilse', reason: 'other_family' }]);
  });
});
