// What a verdict does to the assignee's file (implementation-plan §2.6, §3.13, ADR 0020): one entry in the
// reputation window and in the window of each of the quest's tags, the last 20 kept, and the fail streak that
// breakers.same_fail_suspend counts. The Steward and the sandbox both go through it, so a fake day keeps the books
// a real one keeps (P1-04). levelChange reads the windows afterwards.
import { VERDICT_WINDOW_MAX } from '../schema/character/constants.ts';
import type { TagId, VerdictId } from '../core/ids.ts';
import type { Character, VerdictEntry } from '../schema/character/character.ts';
import type { FailKind } from '../schema/common.ts';

interface JudgementBase {
  readonly verdict_id: VerdictId;
  /** The owner's seal or return: weighs three agent verdicts (HUMAN_VERDICT_WEIGHT). */
  readonly by_human: boolean;
  readonly at: string;
  /** The quest's tags: the window of each gets the entry. */
  readonly tags: readonly TagId[];
}

/** A pass or a fail on the assignee's work; a partial verdict judges nothing yet and enters no window. */
export type Judgement =
  | (JudgementBase & { readonly result: 'pass' })
  | (JudgementBase & { readonly result: 'fail'; readonly fail_kind: FailKind });

const kept = (window: readonly VerdictEntry[], entry: VerdictEntry): VerdictEntry[] =>
  [...window, entry].slice(-VERDICT_WINDOW_MAX);

/** A pass ends the streak; a fail of the kind before lengthens it; any other fail starts a new one. */
function streakAfter(character: Character, judgement: Judgement): Character['consecutive_fail'] {
  if (judgement.result === 'pass') return { count: 0 };
  const before = character.consecutive_fail;
  const count = before.fail_kind === judgement.fail_kind ? before.count + 1 : 1;
  return { fail_kind: judgement.fail_kind, count };
}

export function withVerdict(character: Character, judgement: Judgement): Character {
  const entry: VerdictEntry = {
    verdict_id: judgement.verdict_id,
    result: judgement.result,
    by_human: judgement.by_human,
    at: judgement.at,
  };
  const affinity = { ...character.skill_affinity };
  for (const tag of judgement.tags) affinity[tag] = { window: kept(affinity[tag]?.window ?? [], entry) };
  return {
    ...character,
    reputation: { window: kept(character.reputation.window, entry) },
    skill_affinity: affinity,
    consecutive_fail: streakAfter(character, judgement),
  };
}
