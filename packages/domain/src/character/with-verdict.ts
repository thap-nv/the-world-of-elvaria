// What a verdict does to the assignee's file (implementation-plan §2.6, §3.13, ADR 0020): one entry in the
// reputation window and in the window of each of the quest's tags, the last 20 kept, and the fail streak that
// breakers.same_fail_suspend counts. The Steward and the sandbox both go through it, so a fake day keeps the books
// a real one keeps (P1-04). levelChange reads the windows afterwards. (PS-22) A pass that sustains an objection
// takes the verdict it overturned out of the windows, as the owner's rejudge keeps a judge's error out of them.
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
  | (JudgementBase & {
      readonly result: 'pass';
      /**
       * The fail verdict this pass overturned: a second judge read the assignee's objection and passed the work
       * (PS-22). That fail leaves every window; the pass ends the streak it lengthened.
       */
      readonly overturns?: VerdictId;
    })
  | (JudgementBase & {
      readonly result: 'fail';
      readonly fail_kind: FailKind;
      /**
       * The owner's return for a new judgement (`verdict.rejudge`, P1-40): the judge erred, not the assignee, so the
       * fail enters no window and leaves the streak as it was.
       */
      readonly rejudge?: boolean;
    });

const kept = (window: readonly VerdictEntry[], entry: VerdictEntry, without?: VerdictId): VerdictEntry[] =>
  [...window.filter(({ verdict_id: id }) => id !== without), entry].slice(-VERDICT_WINDOW_MAX);

/** A pass ends the streak; a fail of the kind before lengthens it; any other fail starts a new one. */
function streakAfter(character: Character, judgement: Judgement): Character['consecutive_fail'] {
  if (judgement.result === 'pass') return { count: 0 };
  const before = character.consecutive_fail;
  const count = before.fail_kind === judgement.fail_kind ? before.count + 1 : 1;
  return { fail_kind: judgement.fail_kind, count };
}

export function withVerdict(character: Character, judgement: Judgement): Character {
  // In the P1-35 run the owner returned a quest a judge had passed without breaking anything, and the return counted
  // as a fail of the assignee, three times over (by_human); a rejudge does not judge the assignee's work.
  if (judgement.result === 'fail' && judgement.rejudge === true) return character;
  const entry: VerdictEntry = {
    verdict_id: judgement.verdict_id,
    result: judgement.result,
    by_human: judgement.by_human,
    at: judgement.at,
  };
  const overturned = judgement.result === 'pass' ? judgement.overturns : undefined;
  const affinity = { ...character.skill_affinity };
  for (const tag of judgement.tags)
    affinity[tag] = { window: kept(affinity[tag]?.window ?? [], entry, overturned) };
  return {
    ...character,
    reputation: { window: kept(character.reputation.window, entry, overturned) },
    skill_affinity: affinity,
    consecutive_fail: streakAfter(character, judgement),
  };
}
