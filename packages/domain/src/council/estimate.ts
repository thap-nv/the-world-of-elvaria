// A draft's estimate (PS-06, the owner's choice of 2026-11-13): the tokens the breaker counts, and the peak context
// that decides whether the job fits one context (ADR 0017, amended).
import type { Quest } from '../schema/quest/quest.ts';
import type { QuestDraft } from '../schema/quest/quest-draft.ts';

/** What the session holds at its peak; a draft without it stands on its tokens, as before PS-06. */
export const peakContextOf = (estimate: QuestDraft['estimate']): number =>
  estimate.context ?? estimate.tokens;

/** The estimate the quest keeps: the peak context is a planning number of the draft only. */
export const questEstimateOf = ({ tokens, minutes }: QuestDraft['estimate']): Quest['estimate'] => ({
  tokens,
  minutes,
});
