// selectVerifier(quest, candidates, policy): who judges a submitted session-tier quest (implementation-plan §3.2,
// ADR 0008, ADR 0020). Never anyone who worked the quest, or any quest of its party; a class that verifies the
// quest's kind; never the model of anyone who worked it (P1-55: of every run, not only the last: the Steward's own
// run of a party's merge has no assignee to compare). Among those free now: another model family first, then another
// tribe (account), then on a quest of rank STRONG_JUDGE_MIN_RANK or above, or one whose work changed a protected path
// (PS-04, ADR 0026), the judge of the higher level (P1-48), then
// a tribe whose CLI hands in a structured verdict itself over one whose judge answers in text (§3.14
// `prompt_and_parse`, P1-33), then the one idle the longest. With no judge of another family free,
// dispatch.verifier_same_family decides: `different_model` takes a free judge of the same family on another model
// (or waits for one), `machine_only` waits for a judge of another family while the roster has one, and lets the
// machine judge once it has none. A judge that left this review without a verdict is not chosen again while another
// judge may take it: one a breaker stopped would most likely spend its budget the same way (P1-38, P1-35 (d)), one
// whose session crashed or never opened most likely fails the same way (fix/review-no-session); nor is the judge that
// just handed in a partial verdict (P1-48, P1-42 (c)): fresh eyes read on from where it stopped. Before both, a judge
// whose tribe takes a shorter prompt than the one measured for it is passed over while another judge may take the
// quest (prompt-limit.ts, fix/verifier-prompt-limit): its session would not open. (PS-22) An objection
// waiting on the quest takes a second judge: never the judge of the verdict it contests, and never the machine, which
// cannot read a letter; with no such judge in the roster the quest waits as one nobody may judge. (PS-11) A quest whose
// ritual asks for eyes (judgedByEye, `needs_vision`) takes only a judge whose tribe reads images, however few: one that
// cannot see the screens would judge them blind; and never the machine, as with an objection.
import { justPartialOf, leftVerifiersOf } from '../breaker/review.ts';
import { STRONG_JUDGE_MIN_RANK } from './constants.ts';
import { byIdleSince } from '../dispatch/roster.ts';
import { RANKS } from '../schema/common.ts';
import { apartFromDoers } from './apart-from-doers.ts';
import { pastAssigneesOf } from './past-assignees-of.ts';
import { withinPromptLimit } from './prompt-limit.ts';
import { touchesProtected } from './protected.ts';
import type { Character } from '../schema/character/character.ts';
import type { Kingdom } from '../schema/kingdom.ts';
import type { Quest } from '../schema/quest/quest.ts';
import type { CharacterClass } from '../schema/registry-entries.ts';
import type { CharacterId, TribeId } from '../core/ids.ts';
import type { TribeLimits } from '../tribe/tribe-limits.ts';
import type { TribeModels } from '../tribe/models.ts';

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
   * Each tribe's limits (tribeLimitsOn): a judge whose tribe answers in text (`prompt_and_parse`) comes after an
   * otherwise equal one whose CLI enforces the verdict's schema, and one whose tribe takes a shorter prompt than
   * `prompt_chars` says is passed over (withinPromptLimit), and under `needs_vision` one whose tribe reads no image is
   * never taken. Absent: no tribe is told apart, and none reads images.
   */
  readonly limits?: Readonly<
    Partial<Record<TribeId, Pick<TribeLimits, 'structured_output' | 'prompt_max_chars' | 'vision'>>>
  >;
  /**
   * The quest's ritual asks for eyes (judgedByEye, PS-11): only a judge whose tribe's limits say `vision` may take it,
   * and the machine never judges it alone. Absent: false.
   */
  readonly needs_vision?: boolean;
  /** The length of this review's prompt for each judge the Steward measured (ReviewPrompt). Absent: none. */
  readonly prompt_chars?: Readonly<Partial<Record<CharacterId, number>>>;
  /**
   * The models each tribe's adapter declares, with their families (PS-23): a judge or doer on a model its tribe names
   * without a family, or does not name, is of no known family and never counts as another one. Absent: every family
   * is read from the slug (familyOf).
   */
  readonly models?: TribeModels;
}

export type Selection =
  | { readonly reason: 'other_family' | 'same_family_other_model'; readonly character: Character }
  /** The Steward issues the verdict from the machine checks (`verifier_id: machine`). */
  | { readonly reason: 'machine_only' };

/** Nobody fits now: the quest waits in review for a later tick. */
export type NoVerifier = null;

/**
 * Whether `quest` wants the stronger judge first: from rank B (P1-48, P1-16 (l): "Opus from rank B"), and whatever its
 * rank once its work changed a protected path (PS-04, ADR 0026).
 */
export const wantsStrongJudge = (quest: Pick<Quest, 'rank' | 'protected_changes'>): boolean =>
  RANKS.indexOf(quest.rank) >= RANKS.indexOf(STRONG_JUDGE_MIN_RANK) || touchesProtected(quest);

/**
 * Another tribe first (another account, another pool), then on a quest that wants it the stronger judge, then a
 * structured verdict over one parsed from text, then the one idle the longest. The text road is placed before the
 * idle time, not after it: idle times almost never tie, so a criterion after them would never choose (P1-33).
 * Strength is the judge's level, which the owner sets by its model when summoning it (P1-38): never a table of
 * models in the core, and the separation rules above it are untouched.
 */
const byPreference = (quest: Quest, { doers, limits }: Pick<VerifierPolicy, 'doers' | 'limits'>) => {
  const sameTribe = (c: Character): number => Number(doers.some(({ tribe }) => tribe === c.tribe));
  const weaker = wantsStrongJudge(quest) ? (c: Character): number => -c.level : () => 0;
  const inText = (c: Character): number =>
    Number(limits?.[c.tribe]?.structured_output === 'prompt_and_parse');
  return (a: Character, b: Character): number =>
    sameTribe(a) - sameTribe(b) || weaker(a) - weaker(b) || inText(a) - inText(b) || byIdleSince(a, b);
};

/**
 * Who may ever judge `quest`: a judge of its kind, never one of its doers, never on a model one of them used, never
 * the judge whose verdict the quest's objection contests (PS-22), and for a quest that needs eyes never a judge whose
 * tribe reads no image (PS-11).
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
  const sees = (c: Character): boolean =>
    policy.needs_vision !== true || policy.limits?.[c.tribe]?.vision === true;
  return candidates.filter(
    (c) =>
      judges.has(c.class) &&
      !pastAssignees.has(c.id) &&
      !models.has(c.model) &&
      c.id !== contested &&
      sees(c),
  );
}

/** Only a judge may answer the quest: the machine reads no objection (PS-22) and sees no screen (PS-11). */
const judgeOnly = (quest: Quest, policy: Pick<VerifierPolicy, 'needs_vision'>): boolean =>
  quest.objection !== undefined || policy.needs_vision === true;

/**
 * Whether `quest` waits in review for a judge the roster does not have (P1-15): under `different_model`, nobody
 * among `candidates` may ever judge it, so it waits until the owner summons one. Under `machine_only` the machine
 * judges when no judge of another family exists, so a quest never waits for ever; except one only a judge may answer
 * (an objection, PS-22; screens to see, PS-11), which waits when the roster has no judge it would take.
 */
export function waitsForNoJudge(
  quest: Quest,
  candidates: readonly Character[],
  policy: Omit<VerifierPolicy, 'free'>,
): boolean {
  if (judgeOnly(quest, policy)) return awaitedJudges(quest, candidates, policy).length === 0;
  return policy.same_family === 'different_model' && fitJudges(quest, candidates, policy).length === 0;
}

/**
 * The fit judges less those that left this review without a verdict (leftVerifiersOf) and the one that just handed in
 * a partial verdict (justPartialOf), when one that `may` take it is left, free now or later: the quest then waits for
 * that one. With nobody else, they may judge again, and REVIEW_BREAKS_MAX and REVIEW_PARTIALS_MAX bound the review as
 * before; neither the machine nor a waiting quest stands in for them.
 */
function besidesPassedOver(
  quest: Quest,
  fit: readonly Character[],
  may: (character: Character) => boolean,
): readonly Character[] {
  const passedOver = new Set(leftVerifiersOf(quest));
  const partial = justPartialOf(quest);
  if (partial !== undefined) passedOver.add(partial);
  const others = fit.filter(({ id }) => !passedOver.has(id));
  return others.some(may) ? others : fit;
}

/**
 * The judges selectVerifier draws from, and whether one is of another family than the doers: those whose prompt their
 * tribe takes first (withinPromptLimit), as a session that cannot open is a sure loss where a breaker or a crash may
 * not come again; then besidesPassedOver among them.
 */
function judgesFor(
  quest: Quest,
  candidates: readonly Character[],
  policy: Omit<VerifierPolicy, 'free'>,
): {
  readonly fit: readonly Character[];
  readonly otherFamily: (character: Character) => boolean;
  readonly machineOnly: boolean;
} {
  const otherFamily = (character: Character): boolean =>
    apartFromDoers(character, policy.doers, policy.models);
  const machineOnly = policy.same_family === 'machine_only';
  const may = (c: Character): boolean => !machineOnly || otherFamily(c);
  const fit = besidesPassedOver(
    quest,
    withinPromptLimit(fitJudges(quest, candidates, policy), may, policy),
    may,
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
  // The quest waits for a judge, as waitsForNoJudge says.
  if (machineOnly)
    return fit.some(otherFamily) || judgeOnly(quest, policy) ? null : { reason: 'machine_only' };
  const same = free[0];
  return same === undefined ? null : { reason: 'same_family_other_model', character: same };
}
