// selectVerifier after a judge left the review with no verdict and no breaker (fix/review-no-session). PS-07, on the
// owner's kingdom: (A) a Codex judge's CLI refused the verdict's schema twice in a second, 0 tokens, and was chosen
// again, so both turns of the review went; (B) an agy judge could not open its session (its prompt was longer than
// Windows takes) and was chosen again every tick for 16 minutes while a Claude judge was free.
import { describe, expect, it } from 'vitest';

import { CLASSES, Q1, character, inReview, moved, quest } from '../dispatch/__fixtures__/snapshot.ts';
import { selectVerifier } from './select-verifier.ts';
import type { Character } from '../schema/character/character.ts';
import type { Quest } from '../schema/quest/quest.ts';

const THORN = character('thorn');
const judge = (id: string, spec: Parameters<typeof character>[1] = {}) =>
  character(id, { cls: 'judge', model: 'claude-opus-5-5', ...spec });
const CASSIA = judge('cassia', { tribe: 'codex', model: 'gpt-6.1-sol' });
const ILSE = judge('ilse', { tribe: 'gemini', model: 'gemini-3.8-flash-high' });
const MAREN = judge('maren');
const submitted = inReview(quest(Q1), 'thorn');

const chosen = (q: Quest, candidates: readonly Character[]) => {
  const selection = selectVerifier(q, candidates, {
    same_family: 'different_model',
    classes: CLASSES,
    doers: [THORN],
    party: [],
    free: (candidate) => candidate.status === 'idle',
  });
  return selection === null || selection.reason === 'machine_only' ? selection : selection.character.id;
};

const crashed = (base: Quest, verifier: string, minute: number): Quest =>
  moved(base, minute, ['assign_verifier', 'steward', { verifier }], ['crash', 'steward']);
const unopened = (base: Quest, verifier: string, minute: number): Quest =>
  moved(base, minute, ['no_session', 'steward', { verifier }]);

describe('selectVerifier after a judge left without a verdict, no breaker involved', () => {
  it('does not choose a judge whose session crashed while another may take the review (A)', () => {
    const once = crashed(submitted, 'cassia', 20);
    expect(chosen(once, [CASSIA, ILSE, MAREN])).toBe('ilse');
    expect(chosen(once, [CASSIA, MAREN])).toBe('maren');
    // The other judge is busy: the review waits for it rather than the judge that just crashed.
    expect(chosen(once, [CASSIA, { ...MAREN, status: 'reviewing' }])).toBeNull();
  });

  it('does not choose a judge whose session never opened while another may take the review (B)', () => {
    const once = unopened(submitted, 'ilse', 20);
    expect(chosen(once, [ILSE, MAREN])).toBe('maren');
    expect(chosen(once, [ILSE, { ...MAREN, status: 'reviewing' }])).toBeNull();
  });

  it('chooses it again when nobody else may ever take the review: REVIEW_BREAKS_MAX bounds it', () => {
    expect(chosen(unopened(submitted, 'ilse', 20), [ILSE])).toBe('ilse');
    expect(chosen(crashed(submitted, 'cassia', 20), [CASSIA])).toBe('cassia');
  });

  it("chooses it again after the owner's retry of the review those two stalled", () => {
    const stalled = crashed(unopened(submitted, 'ilse', 20), 'cassia', 30);
    const retried = moved(stalled, 35, ['crash', 'steward'], ['retry', 'user']);
    expect(retried).toMatchObject({ status: 'review', verifier: null });
    expect(chosen(retried, [ILSE, MAREN])).toBe('ilse');
  });
});
