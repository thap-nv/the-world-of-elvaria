// selectVerifier(quest, candidates, policy): who judges a submitted session-tier quest (implementation-plan §3.2,
// ADR 0008, ADR 0020). Never anyone who worked the quest, or any quest of its party; a class that verifies the
// quest's kind; never the model of anyone who worked it (P1-55: of every run, not only the last: the Steward's own
// run of a party's merge has no assignee to compare). Among those free now: another model family first, then another
// tribe (account), then on a quest of rank STRONG_JUDGE_MIN_RANK or above the judge of the higher level (P1-48), then
// a tribe whose CLI hands in a structured verdict itself over one whose judge answers in text (§3.14
// `prompt_and_parse`, P1-33), then the one idle the longest. With no judge of another family free,
// dispatch.verifier_same_family decides: `different_model` takes a free judge of the same family on another model
// (or waits for one), `machine_only` waits for a judge of another family while the roster has one, and lets the
// machine judge once it has none. A judge a breaker stopped in this review is not chosen again while another judge
// may take it (P1-38, P1-35 (d)): it would most likely spend its budget the same way; nor is the judge that just
// handed in a partial verdict (P1-48, P1-42 (c)): fresh eyes read on from where it stopped. (PS-22) An objection
// waiting on the quest takes a second judge: never the judge of the verdict it contests, and never the machine, which
// cannot read a letter; with no such judge in the roster the quest waits as one nobody may judge.
import { cutVerifiersOf, justPartialOf } from '../breaker/review.ts';
import { familyOf } from '../character/family.ts';
import { STRONG_JUDGE_MIN_RANK } from '../constants.ts';
import { byIdleSince } from '../dispatch/roster.ts';
import { RANKS } from '../schema/common.ts';
import { pastAssigneesOf } from './past-assignees-of.ts';
import type { Character } from '../schema/character/character.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { CharacterClass } from '../schema/registry-entries.ts';
import type { TribeId } from '../core/ids.ts';
import type { TribeLimits } from '../tribe/tribe-limits.ts';

export type VerifierClass = Pick<CharacterClass, 'id' | 'is_verifier' | 'kinds'>;

export interface VerifierPolicy {
  readonly same_family: Kingdom['dispatch']['verifier_same_family'];
  readonly classes: readonly VerifierClass[];
  /**
   * The files of those who worked the quest itself that still exist, the current assignee's included (workedOn): their
   * models and tribes. Empty when the quest was worked by the machine alone.
   */
  readonly doers: readonly Pick<Character, 'model' | 'tribe'>[];
  /** The other quests of the quest's party (partyOf); empty outside a party. */
  readonly party: readonly Quest[];
  /** Whether a candidate may open a session now: idle, its tribe awake and with a slot left. */
  readonly free: (character: Character) => boolean;
  /**
   * Each tribe's limits (tribeLimitsOf): a judge whose tribe answers in text (`prompt_and_parse`) comes after an
   * otherwise equal one whose CLI enforces the verdict's schema. Absent: no tribe is told apart.
   */
  readonly limits?: Readonly<Partial<Record<TribeId, Pick<TribeLimits, 'structured_output'>>>>;
}

export type Selection =
  | { readonly reason: 'other_family' | 'same_family_other_model'; readonly character: Character }
  /** The Steward issues the verdict from the machine checks (`verifier_id: machine`). */
  | { readonly reason: 'machine_only' };

/** Nobody fits now: the quest waits in review for a later tick. */
export type NoVerifier = null;

/** Whether a quest of `rank` wants the stronger judge first (P1-48, P1-16 (l): "Opus from rank B"). */
export const wantsStrongJudge = (rank: Quest['rank']): boolean =>
  RANKS.indexOf(rank) >= RANKS.indexOf(STRONG_JUDGE_MIN_RANK);

/**
 * Another tribe first (another account, another pool), then on a quest that wants it the stronger judge, then a
 * structured verdict over one parsed from text, then the one idle the longest. The text road is placed before the
 * idle time, not after it: idle times almost never tie, so a criterion after them would never choose (P1-33).
 * Strength is the judge's level, which the owner sets by its model when summoning it (P1-38): never a table of
 * models in the core, and the separation rules above it are untouched.
 */
const byPreference = (quest: Quest, { doers, limits }: Pick<VerifierPolicy, 'doers' | 'limits'>) => {
  const sameTribe = (c: Character): number => Number(doers.some(({ tribe }) => tribe === c.tribe));
  const weaker = wantsStrongJudge(quest.rank) ? (c: Character): number => -c.level : () => 0;
  const inText = (c: Character): number =>
    Number(limits?.[c.tribe]?.structured_output === 'prompt_and_parse');
  return (a: Character, b: Character): number =>
    sameTribe(a) - sameTribe(b) || weaker(a) - weaker(b) || inText(a) - inText(b) || byIdleSince(a, b);
};

/**
 * Who may ever judge `quest`: a judge of its kind, never one of its doers, never on a model one of them used, never
 * the judge whose verdict the quest's objection contests (PS-22).
 */
function fitJudges(
  quest: Quest,
  candidates: readonly Character[],
  policy: Omit<VerifierPolicy, 'same_family' | 'free'>,
): Character[] {
  const judges = new Set(
    policy.classes
      .filter(({ is_verifier, kinds }) => is_verifier && kinds.includes(quest.kind))
      .map((c) => c.id),
  );
  const pastAssignees = pastAssigneesOf(quest, policy.party);
  const models = new Set(policy.doers.map(({ model }) => model));
  const contested = quest.objection?.judge;
  return candidates.filter(
    (c) => judges.has(c.class) && !pastAssignees.has(c.id) && !models.has(c.model) && c.id !== contested,
  );
}

/**
 * Whether `quest` waits in review for a judge the roster does not have (P1-15): under `different_model`, nobody
 * among `candidates` may ever judge it, so it waits until the owner summons one. Under `machine_only` the machine
 * judges when no judge of another family exists, so a quest never waits for ever; except one with an objection, which
 * waits when the roster has no judge it would take (PS-22).
 */
export function waitsForNoJudge(
  quest: Quest,
  candidates: readonly Character[],
  policy: Omit<VerifierPolicy, 'free'>,
): boolean {
  if (quest.objection !== undefined) return awaitedJudges(quest, candidates, policy).length === 0;
  return policy.same_family === 'different_model' && fitJudges(quest, candidates, policy).length === 0;
}

/**
 * The fit judges less those a breaker stopped in this review (cutVerifiersOf) and the one that just handed in a
 * partial verdict (justPartialOf), when one that `may` take it is left, free now or later: the quest then waits for
 * that one. With nobody else, they may judge again, and REVIEW_BREAKS_MAX and REVIEW_PARTIALS_MAX bound the review as
 * before; neither the machine nor a waiting quest stands in for them.
 */
function besidesPassedOver(
  quest: Quest,
  fit: readonly Character[],
  may: (character: Character) => boolean,
): readonly Character[] {
  const passedOver = new Set(cutVerifiersOf(quest));
  const partial = justPartialOf(quest);
  if (partial !== undefined) passedOver.add(partial);
  const others = fit.filter(({ id }) => !passedOver.has(id));
  return others.some(may) ? others : fit;
}

/** The judges selectVerifier draws from (besidesPassedOver), and whether one is of another family than the doers. */
function judgesFor(
  quest: Quest,
  candidates: readonly Character[],
  policy: Omit<VerifierPolicy, 'free'>,
): {
  readonly fit: readonly Character[];
  readonly otherFamily: (character: Character) => boolean;
  readonly machineOnly: boolean;
} {
  const families = new Set(policy.doers.map(({ model }) => familyOf(model)));
  const otherFamily = (character: Character): boolean => !families.has(familyOf(character.model));
  const machineOnly = policy.same_family === 'machine_only';
  const fit = besidesPassedOver(
    quest,
    fitJudges(quest, candidates, policy),
    (c) => !machineOnly || otherFamily(c),
  );
  return { fit, otherFamily, machineOnly };
}

/**
 * The judges a quest waits for when selectVerifier gives it nobody now (PS-03): those it would take once free, of
 * another family under `machine_only`. The rules are selectVerifier's own; only the Steward's bell reads this, when
 * the mana of every one of them is closed (judgeWaitOf).
 */
export function awaitedJudges(
  quest: Quest,
  candidates: readonly Character[],
  policy: Omit<VerifierPolicy, 'free'>,
): Character[] {
  const { fit, otherFamily, machineOnly } = judgesFor(quest, candidates, policy);
  return machineOnly ? fit.filter(otherFamily) : [...fit];
}

/**
 * `candidates`: everyone who could judge, now or later (not suspended, of an enabled tribe with a runner);
 * `policy.free` says who can now.
 */
export function selectVerifier(
  quest: Quest,
  candidates: readonly Character[],
  policy: VerifierPolicy,
): Selection | NoVerifier {
  const { fit, otherFamily, machineOnly } = judgesFor(quest, candidates, policy);
  const free = fit.filter(policy.free).toSorted(byPreference(quest, policy));
  const other = free.find(otherFamily);
  if (other !== undefined) return { reason: 'other_family', character: other };
  // The machine reads no objection (PS-22): the quest waits for a judge, as waitsForNoJudge says.
  if (machineOnly)
    return fit.some(otherFamily) || quest.objection !== undefined ? null : { reason: 'machine_only' };
  const same = free[0];
  return same === undefined ? null : { reason: 'same_family_other_model', character: same };
}
