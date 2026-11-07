// The ids of a run's verdict files (implementation-plan §2.1, P1-04): `<quest>-<n>` for the verdict that ends the
// review of run n, `-p<k>` for the partial verdict its k-th verifier session left, `-user` for the owner's seal or
// return. One run can be judged several times, and each judgement keeps its own file.
import { OWNER_VERDICT_SUFFIX, PARTIAL_VERDICT_MARK } from '../schema/quest/verdict.ts';
import type { VerdictId } from '../core/ids.ts';
import type { Quest } from '../schema/quest/quest.ts';

// The quest id and a run number ≥ 1 make the pattern of VerdictIdSchema by construction.
export const verdictIdOf = (quest: Pick<Quest, 'id'>, n: number): VerdictId =>
  `${quest.id}-${n}` as VerdictId;

export const partialVerdictIdOf = (quest: Pick<Quest, 'id'>, n: number, session: number): VerdictId =>
  `${verdictIdOf(quest, n)}${PARTIAL_VERDICT_MARK}${session}` as VerdictId;

export const ownerVerdictIdOf = (quest: Pick<Quest, 'id'>, n: number): VerdictId =>
  `${verdictIdOf(quest, n)}${OWNER_VERDICT_SUFFIX}` as VerdictId;

/** How many verifier sessions run n has had so far: the k of the partial verdict the latest one leaves. */
export const verifierSessionsOf = (quest: Pick<Quest, 'attempt_log'>, n: number): number =>
  quest.attempt_log.filter((entry) => entry.role === 'verifier' && entry.n === n).length;
