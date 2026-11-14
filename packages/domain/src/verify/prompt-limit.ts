// A judge whose tribe cannot take the review's prompt (fix/verifier-prompt-limit, ADR 0008 rule 6, ADR 0021): agy
// takes its prompt on the command line, which Windows stops at 32 767 characters, and a judge's prompt carries the
// diff. In the PS-07 run every judge's prompt was over it; the Steward chose an agy judge anyway and the session never
// opened, which since fix/review-no-session costs one of the review's REVIEW_BREAKS_MAX. The Steward measures each such
// judge's prompt before the tick (its tribe declares `capabilities.prompt_max_chars` for this OS), and the choice
// passes over one whose prompt is longer while another judge may take the quest. The tribe is data, never a switch.
import type { CharacterId, QuestId, TribeId } from '../core/ids.ts';
import type { Character } from '../schema/character/character.ts';
import type { TribeLimits } from '../tribe/tribe-limits.ts';

/** The prompt of one judge for a quest's next review, as the Steward measured it before the tick. */
export interface ReviewPrompt {
  readonly quest: QuestId;
  readonly character: CharacterId;
  /** Characters of the prompt's user part: what agy takes on its command line (the system part goes to a file). */
  readonly chars: number;
}

/** What the rule reads: each tribe's limit on this OS, and each judge's measured prompt for the quest. */
export interface PromptLimitPolicy {
  readonly limits?: Readonly<Partial<Record<TribeId, Pick<TribeLimits, 'prompt_max_chars'>>>>;
  readonly prompt_chars?: Readonly<Partial<Record<CharacterId, number>>>;
}

/** The measured prompt of each judge for `quest`, from the snapshot's list. */
export function promptCharsOf(
  quest: QuestId,
  prompts: readonly ReviewPrompt[] | undefined,
): Partial<Record<CharacterId, number>> {
  const chars: Partial<Record<CharacterId, number>> = {};
  for (const prompt of prompts ?? []) if (prompt.quest === quest) chars[prompt.character] = prompt.chars;
  return chars;
}

/** Whether `judge`'s tribe takes a shorter prompt than the one measured for it; a limit or a length unknown: no. */
export function overPromptLimit(judge: Character, policy: PromptLimitPolicy): boolean {
  const max = policy.limits?.[judge.tribe]?.prompt_max_chars;
  const chars = policy.prompt_chars?.[judge.id];
  return max !== undefined && chars !== undefined && chars > max;
}

/**
 * The fit judges less those whose tribe cannot take their prompt, when one that `may` take the quest is left, free now
 * or later: the quest then waits for that one. With nobody else they stay, and the Steward tries them as before: the
 * measure is an estimate, the runner's own check decides, and a session that cannot open leaves the review
 * (`review.no_session`) and rings at REVIEW_BREAKS_MAX with the runner's reason (fix/review-no-session).
 */
export function withinPromptLimit(
  fit: readonly Character[],
  may: (character: Character) => boolean,
  policy: PromptLimitPolicy,
): readonly Character[] {
  const within = fit.filter((judge) => !overPromptLimit(judge, policy));
  return within.some(may) ? within : fit;
}
